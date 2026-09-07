// 보호자가 여러 어르신에 연결된 경우 "지금 보고 있는 어르신"을 고르는 규약.
//
// 그전에는 모든 보호자 화면이 `links.find(approved)` — 즉 **목록의 첫 어르신**만
// 봤다. 연결 목록(69:320)에서 둘째 어르신을 눌러도 같은 화면이 떴다.
//
// 선택은 URL 쿼리(`?elder=`)에 싣는다 — 주소를 공유·새로고침해도 같은 화면이 뜨고,
// 뒤로가기가 자연스럽다. 마지막 선택은 localStorage 에 남겨 다음 방문에 잇는다.
//
// ⚠️ URL 값은 신뢰하지 않는다. **승인된 연결 목록 안에 있을 때만** 쓴다
// (없는 id 로도 화면이 뜨면 "이 어르신은 기록이 없다"는 오해를 만든다).
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMyGuardianLinks, type ProfileGuardianRow } from '@giokon/data';
import { useAuth } from '../auth/AuthProvider';

export const ELDER_PARAM = 'elder';
const STORE_KEY = 'giokon.guardian.elder';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

/** 보호자 화면이 공유하는 어르신 선택 상태. */
export interface GuardianElderSelection {
  /** 승인된 연결 전부(선택기 렌더용). */
  approved: ProfileGuardianRow[];
  /** 지금 보고 있는 연결. 승인된 연결이 하나도 없으면 null. */
  link: ProfileGuardianRow | null;
  /** 연결 목록을 아직 못 받았다 — "연결 없음"과 구분해야 한다. */
  loading: boolean;
  /** 연결 조회 자체가 실패했다(빈 화면을 "기록 없음"으로 보이게 두지 않는다). */
  error: unknown;
}

/** 이 어르신을 골라 공개된 소식으로 가는 경로. 연결 목록이 선택기 역할을 한다. */
export function feedHref(profileId: string): string {
  return `/guardian/feed?${ELDER_PARAM}=${encodeURIComponent(profileId)}`;
}

export function useGuardianElder(): GuardianElderSelection {
  const { isConfigured } = useAuth();
  const [params] = useSearchParams();
  const links = useMyGuardianLinks({ enabled: isConfigured });

  const approved = useMemo(
    () => (links.data ?? []).filter((l) => l.status === 'approved'),
    [links.data],
  );

  const wanted = params.get(ELDER_PARAM);
  const link = useMemo(() => {
    if (!approved.length) return null;
    // URL → 저장값 → 첫 연결. 앞의 둘은 승인 목록에 있을 때만 받아들인다.
    const byId = (id: string | null) =>
      id ? (approved.find((l) => l.profile_id === id) ?? null) : null;
    return byId(wanted) ?? byId(readStored()) ?? approved[0];
  }, [approved, wanted]);

  // 마지막 선택을 남긴다(렌더 중이 아니라 확정된 뒤에).
  useEffect(() => {
    if (!link) return;
    try {
      window.localStorage.setItem(STORE_KEY, link.profile_id);
    } catch {
      /* 저장이 막힌 브라우저 — 이번 세션 동안 URL 로만 유지된다 */
    }
  }, [link]);

  return { approved, link, loading: links.isPending, error: links.error };
}
