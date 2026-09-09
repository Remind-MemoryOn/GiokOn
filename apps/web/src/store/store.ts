// 웹 UI 상태(Zustand) — **토스트뿐이다**.
//
// 서버 상태는 전부 TanStack Query(`@giokon/data`)가 SoT 다. 예전에는 프로토타입
// 시절의 어르신·세션·연대기 슬라이스가 여기 남아 `persist` 로 localStorage 에
// 저장되고 있었지만(`gieok-on-prototype-v3`), 화면은 이미 아무도 읽지 않았다 —
// 어르신 개인정보를 브라우저에 쌓아 둘 이유가 없어 슬라이스와 persist 를 함께 없앴다.
// (계획 Phase 2: "스토어의 세션 슬라이스를 제거한다")
import { create } from 'zustand';
import { uid } from '../lib/utils';

interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface State {
  resetForAuth: () => void;
  toasts: ToastItem[];
  /** 3.2초 뒤 자동으로 사라진다(디자인 실측). */
  toast: (kind: ToastItem['kind'], message: string) => void;
  dismissToast: (id: string) => void;
}

export const useStore = create<State>()((set, get) => {
  let generation = 0;
  const makeToast = (): State['toast'] => {
    const captured = generation;
    return (kind, message) => {
      if (captured !== generation) return;
      const id = uid('t_');
      set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
      setTimeout(() => get().dismissToast(id), 3200);
    };
  };
  return {
  toasts: [],
  toast: makeToast(),
  resetForAuth: () => {
    generation++;
    set({ toasts: [], toast: makeToast() });
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});
