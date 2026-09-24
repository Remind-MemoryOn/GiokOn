// 앱 진입 자격 판정 — **이 앱은 요양보호사(기관 소속)용 세션 실행 도구**다.
//
// 예전에는 로그인만 되어 있으면 메인으로 보냈다. 그래서
//   · 보호자 계정도 요양보호사용 화면에 들어왔고(보호자는 웹 전용),
//   · 기관 없는 계정(웹 온보딩 미완료)도 들어와, 어르신을 등록하려는 순간
//     org_id not-null 위반이라는 날것의 DB 오류를 봤다.
// RLS 가 쓰기를 막더라도 빈 화면·오류만 남고, Live 토큰은 그와 별개로 발급됐다.
//
// 판정은 순수 함수로 두어 테스트한다. 화면은 결과에 따라 보내기만 한다.

/** public.users 중 판정에 필요한 부분만. */
export interface AccessUserRow {
  role: 'org_admin' | 'caregiver' | 'guardian' | 'social_worker' | 'center_director';
  org_id: string | null;
  onboarded_at: string | null;
}

export type AppAccess =
  /** 판정 보류 — 세션·계정 행 조회 중. 화면은 기다린다. */
  | { status: 'loading' }
  /** 로그인 필요. */
  | { status: 'unauthenticated' }
  /** 자격 미달 — 사유를 보여 주고 로그아웃시킨다. */
  | { status: 'blocked'; title: string; message: string }
  | { status: 'ok' };

export function evaluateAppAccess(input: {
  authed: boolean;
  loading: boolean;
  userRow: AccessUserRow | null;
}): AppAccess {
  if (input.loading) return { status: 'loading' };
  if (!input.authed) return { status: 'unauthenticated' };

  // 로그인은 됐는데 계정 행을 못 읽었다 — 네트워크·RLS 문제다. 통과시키면 화면이
  // 전부 빈 상태로 보여 "기록이 없다"고 오해하게 된다.
  if (!input.userRow) {
    return {
      status: 'blocked',
      title: '계정 정보를 불러오지 못했어요',
      message: '네트워크를 확인하고 다시 로그인해 주세요.\n계속되면 기관 관리자에게 문의해 주세요.',
    };
  }

  if (input.userRow.role === 'guardian') {
    return {
      status: 'blocked',
      title: '보호자 계정이에요',
      message:
        '이 앱은 요양보호사가 어르신과의 회상 대화를 진행하는 도구예요.\n' +
        '보호자님은 웹에서 공유된 기록을 확인하실 수 있어요.',
    };
  }

  if (!input.userRow.onboarded_at || !input.userRow.org_id) {
    return {
      status: 'blocked',
      title: '가입이 아직 끝나지 않았어요',
      message: '웹에서 기본 정보와 기관 설정을 먼저 완료해 주세요.\n완료 후 다시 로그인하시면 됩니다.',
    };
  }

  return { status: 'ok' };
}
