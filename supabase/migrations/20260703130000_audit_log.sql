-- MemoryOn(기억온) v1 — 감사로그(접속·처리기록) + 보관·파기 (M10.2 / M10.3, Phase G)
--
-- 근거: 「개인정보의 안전성 확보조치 기준」 — 개인정보 처리시스템의 접속기록을
-- 최소 1~2년 보관(민감정보·대규모 처리 시 2년). 본 서비스는 건강·음성 민감정보를
-- 다루므로 **2년 보관**을 기준으로 한다. DB 트리거로 처리기록(INSERT/UPDATE/DELETE)을
-- 위·변조 어렵게 남기고, 읽기 접속기록은 앱/플랫폼 로그로 보완한다(docs/security.md).
--
-- append-only. 조직/RBAC 마이그레이션(20260703120000) 이후에 적용한다
-- (org_id·app.current_org_id()·app.is_org_admin() 의존).

-- ──────────────────────────────────────────────────────────────────────────
-- 1) audit_log 테이블
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,                 -- 행위자(auth.uid()); 시스템 작업은 null
  org_id uuid,                   -- 테넌트(기관) 컨텍스트
  action text not null,          -- insert | update | delete | (앱레벨) login/export 등
  table_name text,
  record_id text,
  ip inet,
  user_agent text,
  detail jsonb,

  constraint audit_log_action_check
    check (char_length(btrim(action)) between 1 and 40)
);

create index if not exists idx_audit_log_org_occurred
  on public.audit_log(org_id, occurred_at desc);
create index if not exists idx_audit_log_actor
  on public.audit_log(actor_id, occurred_at desc);
create index if not exists idx_audit_log_record
  on public.audit_log(table_name, record_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 처리기록 트리거(데이터 변경을 자동 적재). security definer 로 RLS 우회 삽입.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function app.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_id text;
  rec_org uuid;
begin
  if (tg_op = 'DELETE') then
    rec_id := old.id::text;
    rec_org := old.org_id;
  else
    rec_id := new.id::text;
    rec_org := new.org_id;
  end if;

  insert into public.audit_log (actor_id, org_id, action, table_name, record_id)
  values (auth.uid(), rec_org, lower(tg_op), tg_table_name, rec_id);

  return null; -- AFTER 트리거
end;
$$;

create trigger audit_profiles
after insert or update or delete on public.profiles
for each row execute function app.write_audit_log();

create trigger audit_chronicle_entries
after insert or update or delete on public.chronicle_entries
for each row execute function app.write_audit_log();

create trigger audit_sessions
after insert or update or delete on public.sessions
for each row execute function app.write_audit_log();

create trigger audit_session_logs
after insert or update or delete on public.session_logs
for each row execute function app.write_audit_log();

-- users: 접근권한(역할·기관) 부여·변경·말소 기록(안전성 확보조치 기준).
create trigger audit_users
after insert or update or delete on public.users
for each row execute function app.write_audit_log();

-- consents 등 이후 민감 테이블은 각 마이그레이션에서 동일 트리거를 추가한다.

-- ──────────────────────────────────────────────────────────────────────────
-- 3) RLS: 소속 기관 관리자만 열람. 삽입/수정/삭제는 정의자 트리거 경유(클라이언트 불가).
-- ──────────────────────────────────────────────────────────────────────────

alter table public.audit_log enable row level security;

create policy audit_log_select_admin
on public.audit_log
for select
using (org_id = app.current_org_id() and app.is_org_admin());

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 보관·파기: 최소 2년 보관 후 초과분 정리(데이터 최소화). pg_cron 가용 시 주간 실행.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function app.purge_audit_log(retain interval default interval '2 years')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.audit_log where occurred_at < now() - retain;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- pg_cron 이 활성화된 환경에서만 주간(일요일 03:00) 파기 작업을 등록한다.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-audit-log',
      '0 3 * * 0',
      'select app.purge_audit_log();'
    );
  end if;
exception
  when others then null; -- 스케줄 등록 실패는 마이그레이션을 막지 않는다.
end
$cron$;
