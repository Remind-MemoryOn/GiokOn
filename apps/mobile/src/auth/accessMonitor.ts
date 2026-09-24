import type { UserRow } from '@giokon/data';

/**
 * 권한 재검증 결과. 파일럿 D4(2026-09-24)부터 **담당 배정은 접근 권한이 아니다** — 같은 기관 돌봄팀이면
 * 담당이 아니어도 기록을 보고 대화를 진행한다. 그래서 배정 목록을 더는 추적하지 않는다(예전에는 배정이
 * 하나라도 빠지면 대화를 끊었다 — 새 모델에서는 교대 근무 중 담당 변경마다 대화가 끊기는 오판이다).
 * 실제 권한 상실은 서버 판정으로 잡는다: 역할·기관·온보딩 변경, 현재 어르신이 RLS 로 안 보이게 됨,
 * `can_process_session` 거부(activeProfileDenied).
 */
export interface AccessSnapshot {
  row: UserRow | null;
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
      snapshot = { row: null, activeProfileDenied: true };
    } finally {
      clearTimeout(timer);
    }
    if (generation !== this.generation || uid !== this.uid) return null;
    if (snapshot.row?.id !== uid) snapshot.row = null;
    const old = this.previous;
    const row = snapshot.row;
    if (!row || !row.onboarded_at || !row.org_id || row.role === 'guardian' ||
      snapshot.activeProfileDenied || (old && (
        old.row?.role !== row.role || old.row?.org_id !== row.org_id
      ))) this.effects.reset();
    this.previous = snapshot;
    this.effects.publish(uid, row);
    return row;
  }
}
