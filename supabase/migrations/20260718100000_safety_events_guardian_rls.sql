-- MemoryOn(기억온) — 안전 이벤트 RLS 에서 guardian 역할 배제 (T17.0 / Phase W1)
--
-- 배경: safety_events 의 조회는 "같은 기관 구성원 전체"(교대 대비)로 설계됐다
-- (20260711100000 설계 노트). 그런데 보호자(guardian)가 초대를 통해 기관에
-- 합류하면 같은 org_id 를 갖게 되어 **기관 전체의 위기 발췌(excerpt)** 를 열람할
-- 수 있는 갭이 생긴다. 위기 발췌는 어르신 발화 민감정보이며, 보호자에게는
-- 공개 커밋(guardian_shares) 경유 데이터만 노출한다는 원칙(M17)에 위배된다.
--
-- 조치: 조회·기록·확인(acknowledge) 정책 모두에서 guardian 역할을 배제한다.
-- "기관 구성원 전체 공유"의 의도는 돌봄 종사자(org_admin/caregiver) 간 교대
-- 공유였으므로, 의도를 좁혀 명문화하는 변경이다. append-only.

drop policy if exists safety_events_select_org on public.safety_events;
create policy safety_events_select_org
on public.safety_events
for select
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

drop policy if exists safety_events_insert_scope on public.safety_events;
create policy safety_events_insert_scope
on public.safety_events
for insert
with check (
  user_id = auth.uid()
  and org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
);

drop policy if exists safety_events_update_org on public.safety_events;
create policy safety_events_update_org
on public.safety_events
for update
using (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
)
with check (
  org_id = app.current_org_id()
  and app.current_org_role() <> 'guardian'
  and (acknowledged_by is null or acknowledged_by = auth.uid())
);

-- 삭제 정책은 계속 없음(deny by default).
