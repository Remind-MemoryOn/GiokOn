-- R012: ordinary updates must not relocate records or rewrite their attribution.
begin;
create function app.guard_record_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare field text;
begin
  -- Trusted maintenance/RPCs and FK retention actions use their own authorization.
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  foreach field in array tg_argv loop
    if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
      raise exception 'RECORD_IDENTITY_IMMUTABLE' using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function app.guard_record_identity() from public, anon, authenticated;

do $$
declare rule record; field text; arguments text;
begin
  for rule in select * from (values
    ('profiles',array['id','org_id','user_id']),
    ('chronicle_entries',array['id','org_id','profile_id','user_id']),
    ('sessions',array['id','org_id','profile_id','user_id']),
    ('session_logs',array['id','org_id','profile_id','session_id','user_id']),
    ('session_analyses',array['id','org_id','profile_id','session_id','user_id']),
    ('safety_events',array['id','org_id','profile_id','session_id','user_id']),
    ('care_journals',array['id','org_id','profile_id','author_id']),
    ('journal_photos',array['id','org_id','journal_id','path']),
    ('guardian_shares',array['id','org_id','profile_id','item_type','item_id','shared_by']),
    ('profile_caregivers',array['id','org_id','profile_id','caregiver_user_id']),
    ('profile_guardians',array['id','org_id','profile_id','guardian_user_id']),
    ('elder_codes',array['id','org_id','profile_id']),
    ('notifications',array['id','org_id','profile_id','user_id','kind','source_id']),
    ('inquiries',array['id','author_id']),
    ('inquiry_replies',array['id','inquiry_id','author_id'])
  ) r(table_name,fields) loop
    foreach field in array rule.fields loop
      if not exists(select 1 from pg_attribute
        where attrelid=to_regclass('public.'||rule.table_name) and attname=field and not attisdropped) then
        raise exception 'Missing identity column %.%',rule.table_name,field;
      end if;
    end loop;
    select string_agg(quote_literal(k),',') into arguments from unnest(rule.fields) k;
    execute format('create trigger a_guard_record_identity before update on public.%I
      for each row execute function app.guard_record_identity(%s)',rule.table_name,arguments);
  end loop;
end $$;
commit;
