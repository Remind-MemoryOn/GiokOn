// @giokon/data — 역할 표시·관리 역할 판정(파일럿 D1·D3 · 웹 W6)
//
// `= 'org_admin'` 같은 역할 직접 비교는 새 역할(사회복지사·센터장)을 조용히 빼 버린다(계획 §11-8).
// 판정은 여기 한 곳에서 한다. **권한의 최종 판정은 서버(RPC·RLS)** — 이 값은 버튼을 켜고 끄는 데만 쓴다.

import type { UserRow } from './database.types'

type Role = UserRow['role']

/** 화면에 보이는 역할 이름. */
export const ORG_ROLE_LABEL: Record<Role, string> = {
  org_admin: '기관 관리자',
  center_director: '센터장',
  social_worker: '사회복지사',
  caregiver: '요양보호사',
  guardian: '보호자',
}

/** 직원 초대·합류 승인·역할 지정을 할 수 있는 관리 역할(서버 app.is_org_manager 와 같은 집합). */
export function isOrgManagerRole(role: Role | null | undefined): boolean {
  return role === 'org_admin' || role === 'center_director'
}

/** 상단 바 호칭. 스스로 가입한 요양보호사는 기관을 만들며 org_admin 이 되므로 '요양보호사님'으로 부른다. */
export function roleHonorific(role: Role | null | undefined): string {
  if (role === 'guardian') return '보호자님'
  if (role === 'center_director') return '센터장님'
  if (role === 'social_worker') return '사회복지사님'
  return '요양보호사님'
}
