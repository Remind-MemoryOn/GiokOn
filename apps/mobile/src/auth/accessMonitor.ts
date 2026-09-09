import type { UserRow } from '@giokon/data';

export interface AccessSnapshot {
  row: UserRow | null;
  assignments: string[];
  activeProfileDenied: boolean;
}

/** Ignore old account/request results; a failed or hung check never preserves permission. */
export class AccessMonitor {
  private uid: string | null = null;
  private generation = 0;
  private previous: AccessSnapshot | null = null;

  constructor(private readonly effects: {
    load: (uid: string) => Promise<AccessSnapshot>;
    publish: (uid: string, row: UserRow | null) => void;
    reset: () => void;
  }) {}

  identify(uid: string | null): void {
    if (uid === this.uid) return;
    this.generation++;
    this.uid = uid;
    this.previous = null;
    this.effects.reset();
  }

  async refresh(): Promise<UserRow | null> {
    const uid = this.uid;
    if (!uid) return null;
    const generation = ++this.generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let snapshot: AccessSnapshot;
    try {
      snapshot = await Promise.race([
        this.effects.load(uid),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Access check timed out')), 10_000);
        }),
      ]);
    } catch {
      snapshot = { row: null, assignments: [], activeProfileDenied: true };
    } finally {
      clearTimeout(timer);
    }
    if (generation !== this.generation || uid !== this.uid) return null;
    if (snapshot.row?.id !== uid) snapshot.row = null;
    const old = this.previous;
    const row = snapshot.row;
    if (!row || !row.onboarded_at || !row.org_id || row.role === 'guardian' ||
      snapshot.activeProfileDenied || (old && (
        old.row?.role !== row.role || old.row?.org_id !== row.org_id ||
        old.assignments.some(id => !snapshot.assignments.includes(id))
      ))) this.effects.reset();
    this.previous = snapshot;
    this.effects.publish(uid, row);
    return row;
  }
}
