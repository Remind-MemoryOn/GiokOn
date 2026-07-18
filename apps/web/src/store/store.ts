import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChronicleEntry,
  ConversationLog,
  ElderProfile,
  Session,
} from '../types';
import { DEFAULT_APPEARANCE } from '../types';
import { nowIso, pickAvatarColor, uid } from '../lib/utils';

interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface State {
  elders: ElderProfile[];
  sessions: Session[];
  chronicles: ChronicleEntry[];
  logs: ConversationLog[];
  activeLogId: string | null;
  toasts: ToastItem[];

  // toast
  toast: (kind: ToastItem['kind'], message: string) => void;
  dismissToast: (id: string) => void;

  // elders
  upsertElder: (
    patch: Partial<ElderProfile> & Pick<ElderProfile, 'name' | 'birthYear'> & { id?: string }
  ) => ElderProfile;
  deleteElder: (id: string) => void;
  getElder: (id: string) => ElderProfile | undefined;

  // sessions
  upsertSession: (s: Omit<Session, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }) => Session;
  deleteSession: (id: string) => void;
  getSession: (id: string) => Session | undefined;
  sessionsByElder: (elderId: string) => Session[];

  // chronicles
  upsertChronicle: (
    c: Omit<ChronicleEntry, 'id' | 'recordedAt' | 'updatedAt' | 'source'> & {
      id?: string;
      source?: ChronicleEntry['source'];
    }
  ) => ChronicleEntry;
  deleteChronicle: (id: string) => void;
  chroniclesByElder: (elderId: string) => ChronicleEntry[];

  // conversation logs — 실제 대화는 앱에서 진행되어 DB로 저장된다(Phase E에서 DB 배선).
  // 웹은 조회만 담당한다. 대화 생성/append/종료 로직은 앱(모바일)의 몫.
  getLog: (logId: string) => ConversationLog | undefined;
  logsByElder: (elderId: string) => ConversationLog[];
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      elders: [],
      sessions: [],
      chronicles: [],
      logs: [],
      activeLogId: null,
      toasts: [],

      toast: (kind, message) => {
        const id = uid('t_');
        set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
        setTimeout(() => get().dismissToast(id), 3200);
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      upsertElder: (patch) => {
        const ts = nowIso();
        const existing = patch.id ? get().elders.find((e) => e.id === patch.id) : undefined;
        if (existing) {
          const updated: ElderProfile = { ...existing, ...patch, updatedAt: ts } as ElderProfile;
          set((s) => ({ elders: s.elders.map((e) => (e.id === updated.id ? updated : e)) }));
          return updated;
        }
        const created: ElderProfile = {
          id: patch.id || uid('eld_'),
          name: patch.name,
          birthYear: patch.birthYear,
          hometown: patch.hometown,
          job: patch.job,
          family: patch.family,
          hobbies: patch.hobbies,
          guardian: patch.guardian,
          appearance: patch.appearance || DEFAULT_APPEARANCE,
          avatarColor: patch.avatarColor || pickAvatarColor(patch.name + ts),
          createdAt: ts,
          updatedAt: ts,
        };
        set((s) => ({ elders: [created, ...s.elders] }));
        return created;
      },
      deleteElder: (id) =>
        set((s) => ({
          elders: s.elders.filter((e) => e.id !== id),
          sessions: s.sessions.filter((x) => x.elderId !== id),
          chronicles: s.chronicles.filter((x) => x.elderId !== id),
          logs: s.logs.filter((x) => x.elderId !== id),
        })),
      getElder: (id) => get().elders.find((e) => e.id === id),

      upsertSession: (patch) => {
        const ts = nowIso();
        const existing = patch.id ? get().sessions.find((s) => s.id === patch.id) : undefined;
        if (existing) {
          const updated: Session = { ...existing, ...patch, updatedAt: ts } as Session;
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === updated.id ? updated : x)) }));
          return updated;
        }
        const created: Session = {
          id: patch.id || uid('ses_'),
          title: patch.title,
          therapyType: patch.therapyType,
          note: patch.note,
          durationMinutes: patch.durationMinutes,
          elderId: patch.elderId,
          createdAt: ts,
          updatedAt: ts,
        };
        set((s) => ({ sessions: [created, ...s.sessions] }));
        return created;
      },
      deleteSession: (id) =>
        set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
      getSession: (id) => get().sessions.find((s) => s.id === id),
      sessionsByElder: (elderId) =>
        get()
          .sessions.filter((s) => s.elderId === elderId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      upsertChronicle: (patch) => {
        const ts = nowIso();
        const existing = patch.id ? get().chronicles.find((c) => c.id === patch.id) : undefined;
        if (existing) {
          const updated: ChronicleEntry = {
            ...existing,
            ...patch,
            updatedAt: ts,
          } as ChronicleEntry;
          set((s) => ({
            chronicles: s.chronicles.map((x) => (x.id === updated.id ? updated : x)),
          }));
          return updated;
        }
        const created: ChronicleEntry = {
          id: patch.id || uid('chr_'),
          elderId: patch.elderId,
          topic: patch.topic,
          content: patch.content,
          keywords: patch.keywords,
          source: patch.source || 'Caregiver',
          recordedAt: ts,
          updatedAt: ts,
        };
        set((s) => ({ chronicles: [created, ...s.chronicles] }));
        return created;
      },
      deleteChronicle: (id) =>
        set((s) => ({ chronicles: s.chronicles.filter((x) => x.id !== id) })),
      chroniclesByElder: (elderId) =>
        get()
          .chronicles.filter((c) => c.elderId === elderId)
          .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),

      getLog: (logId) => get().logs.find((l) => l.id === logId),
      logsByElder: (elderId) =>
        get()
          .logs.filter((l) => l.elderId === elderId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    }),
    {
      name: 'gieok-on-prototype-v3',
      partialize: (s) => ({
        elders: s.elders,
        sessions: s.sessions,
        chronicles: s.chronicles,
        logs: s.logs,
      }),
    }
  )
);
