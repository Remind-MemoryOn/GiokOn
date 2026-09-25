// @giokon/data — 직원 합류(파일럿 D3 · 웹 W9) 순수 판정
//
// 초대 코드로 가입한 요양보호사는 **가입은 끝났지만(onboarded_at) 기관이 없다(org_id NULL)**.
// 관리자·센터장이 approve_org_join 하기 전까지 기관 데이터는 0건이다(RLS 불변식 "org_id 가 없으면 0건").
// 이 상태를 요양보호사 화면으로 보내면 "기록이 없다"로 오해한다 → 승인 대기 화면으로 보낸다.

import type { UserRow } from './database.types'

type JoinProbe = Pick<UserRow, 'onboarded_at' | 'role' | 'org_id'>

/** 가입은 했지만 기관 합류 승인을 기다리는(또는 거절·취소돼 기관이 없는) 돌봄팀 계정인가. 보호자는 원래 기관이 없다. */
export function isAwaitingOrgJoin(row: JoinProbe | null | undefined): boolean {
  return Boolean(row && row.onboarded_at && row.role !== 'guardian' && !row.org_id)
}
