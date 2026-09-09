-- R002: 하위 행에 제출된 profile_id/org_id와 실제 부모의 소속을 함께 강제한다.
-- 기존 불일치 자료가 있으면 FK 검증이 실패한다. 개인정보의 소속을 추측해서 백필하지 않는다.
-- actor(user_id)는 교대/탈퇴에 따라 달라질 수 있으므로 소속 키에 포함하지 않는다.
begin;
alter table public.profiles add constraint profiles_id_org_unique unique (id, org_id);
alter table public.sessions add constraint sessions_id_profile_org_unique
  unique (id, profile_id, org_id);

alter table public.sessions add constraint sessions_profile_org_fk
  foreign key (profile_id, org_id) references public.profiles(id, org_id) on delete cascade;
alter table public.session_logs add constraint session_logs_session_profile_org_fk
  foreign key (session_id, profile_id, org_id)
  references public.sessions(id, profile_id, org_id) on delete cascade;
alter table public.session_analyses add constraint session_analyses_session_profile_org_fk
  foreign key (session_id, profile_id, org_id)
  references public.sessions(id, profile_id, org_id) on delete cascade;
alter table public.safety_events add constraint safety_events_profile_org_fk
  foreign key (profile_id, org_id) references public.profiles(id, org_id) on delete cascade;
alter table public.safety_events add constraint safety_events_session_profile_org_fk
  foreign key (session_id, profile_id, org_id)
  references public.sessions(id, profile_id, org_id) on delete set null (session_id);

-- 세션 연결이 없는 안전 이벤트는 계속 허용한다. 연결이 있으면 위 FK가 소속을 검사한다.
-- UPDATE 후 대상도 접근 범위 안이어야 한다(기존 USING은 변경 전 행만 검사).
do $$
declare target_table text;
begin
  foreach target_table in array array['sessions', 'session_logs', 'session_analyses', 'safety_events']
  loop
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
       using (true) with check (
         org_id = app.current_org_id() and app.current_org_role() <> ''guardian''
         and (app.is_assigned_caregiver(profile_id) or app.is_org_admin()))',
      target_table || '_update_target_scope', target_table);
  end loop;
end $$;

create or replace function app.is_session_shared_to_me(p_session_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions parent
    join public.session_analyses a
      on a.session_id = parent.id
     and a.profile_id = parent.profile_id and a.org_id = parent.org_id
    join public.guardian_shares s
      on s.item_type = 'analysis' and s.item_id = a.id
     and s.profile_id = parent.profile_id and s.org_id = parent.org_id
     and s.revoked_at is null
    join public.profile_guardians pg
      on pg.profile_id = parent.profile_id and pg.org_id = parent.org_id
     and pg.guardian_user_id = auth.uid() and pg.status = 'approved'
    where parent.id = p_session_id and parent.status = 'ended'
  );
$$;
revoke execute on function app.is_session_shared_to_me(uuid) from public;
grant execute on function app.is_session_shared_to_me(uuid) to authenticated;
commit;
