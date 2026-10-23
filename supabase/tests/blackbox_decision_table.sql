-- Run only against an isolated PG16 test database after the standard regression
-- fixtures (pilot_access.sql). Uses public requests and observable rows/errors;
-- no function bodies, system catalogs, branch or coverage assertions.
\set ON_ERROR_STOP on
begin;
set client_min_messages = warning;
set test.uid = '';

create temp table bb_context as
select org_id from public.users where id = 'a0000000-0000-0000-0000-000000000001';
grant select on bb_context to authenticated;
create temp table bb_results (id text, finalized boolean, approved boolean,
  publish_authorized boolean, expected boolean, actual boolean, error text);

do $$
declare
  admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  staff_id uuid := 'a0000000-0000-0000-0000-000000000002';
  pid uuid;
  jid uuid;
  f boolean;
  a boolean;
  p boolean;
  accepted boolean;
  err text;
  error_state text;
  before_count int;
  after_count int;
begin
  assert (select count(*) from bb_context) = 1, 'Requires isolated pilot fixtures';
  set role authenticated;
  perform set_config('test.uid', admin_id::text, true);
  insert into public.profiles (user_id, name, birth_year)
    values (admin_id, 'BB 합성 어르신', 1940) returning id into pid;
  reset role;

  foreach f in array array[false,true] loop
    foreach a in array array[false,true] loop
      foreach p in array array[false,true] loop
        set role authenticated;
        perform set_config('test.uid', admin_id::text, true);
        insert into public.program_journals (profile_id, activity_content,
          facilitator_user_id, program_type, guardian_text)
          values (pid, '합성 회상 대화 기록', admin_id, '회상', '합성 보호자 문장')
          returning id into jid;
        if a then
          update public.program_journals set guardian_text_approved_at = now() where id = jid;
        end if;
        if f then
          update public.program_journals set status = 'final' where id = jid;
        end if;
        reset role;
        select count(*) into before_count from public.guardian_shares where item_id = jid;
        assert before_count = 0, 'Fresh target must not already be shared';
        set role authenticated;
        perform set_config('test.uid', (case when p then admin_id else staff_id end)::text, true);
        err := null;
        error_state := null;
        begin
          insert into public.guardian_shares (profile_id, item_type, item_id, shared_by)
            values (pid, 'journal', jid, auth.uid());
        exception when others then
          get stacked diagnostics err = message_text, error_state = returned_sqlstate;
        end;
        reset role;
        select count(*) into after_count from public.guardian_shares where item_id = jid;
        accepted := after_count = 1;
        -- An unexpected harness/SQL error is a test failure, never a denial pass.
        if not (f and a and p) then
          assert err is not null, 'Rejected combination must return an error';
          assert err = 'SHARE_JOURNAL_NOT_READY' or error_state = '42501',
            format('Unexpected denial error: %s / %s', error_state, err);
          assert after_count = 0, 'Denied combination must leave no share';
        else
          assert err is null, format('Allowed combination failed: %s', err);
        end if;
        assert accepted = (f and a and p),
          format('F=%s A=%s P=%s expected=%s actual=%s', f,a,p,f and a and p,accepted);
        insert into bb_results values (
          'DT-SHARE-' || f::int || a::int || p::int, f,a,p, f and a and p, accepted, err);
      end loop;
    end loop;
  end loop;
end $$;

select * from bb_results order by id;
select count(*) = 8 and bool_and(expected = actual) as all_eight_passed from bb_results;
rollback;
