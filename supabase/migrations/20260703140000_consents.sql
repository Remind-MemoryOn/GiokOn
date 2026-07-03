-- MemoryOn(기억온) v1 — 동의(consents) 아키텍처 (M9.1 / M9.2, Phase H)
--
-- 근거: 개인정보보호법 — 민감정보(건강·음성)는 **별도 동의**, 국외이전(LLM/STT/TTS)은
-- 별도 고지·동의, 마케팅은 선택 분리. 어르신 대상 동의는 **의사능력 판정**과
-- 대리동의(성년후견/보호자) 경로가 필요하다(PIPA 법정대리인=만14세 미만 전용이라
-- 성인은 민법 후견체계로만 대리 → 회색지대 위험고지·최소수집 폴백). 상세: docs/compliance.md.
--
-- append-only. 조직/RBAC(20260703120000) + 감사로그(20260703130000) 이후 적용.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) enum: 동의 유형 / 동의 주체 / 의사능력
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  create type public.consent_type as enum (
    'privacy_required',        -- 개인정보 수집·이용(필수)
    'sensitive_health_voice',  -- 민감정보(건강·음성) 별도 동의
    'cross_border_transfer',   -- 국외이전(LLM/STT/TTS)
    'ai_processing',           -- AI 이용 고지 확인
    'marketing_optional'       -- 마케팅(선택)
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.consent_subject_type as enum ('self', 'guardian', 'legal_representative');
exception when duplicate_object then null;
end $$;

do $$
begin
  -- 어르신 의사능력 판정: 본인동의 가능 / 제한적 / 불가 / 미판정
  create type public.consent_capacity as enum ('capable', 'limited', 'incapable', 'unknown');
exception when duplicate_object then null;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) consents 테이블
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,   -- 동의를 기록한 요양보호사(수집자)
  profile_id uuid references public.profiles(id) on delete cascade,      -- 대상 어르신(어르신 관련 동의 시)
  consent_type public.consent_type not null,
  granted boolean not null,
  version text not null,                                                  -- 동의서/처리방침 버전
  subject_type public.consent_subject_type not null default 'self',
  guardian_name text,                                                     -- 대리동의자(후견인/보호자)
  guardian_relation text,
  capacity public.consent_capacity not null default 'unknown',           -- 어르신 의사능력 판정
  basis text,                                                             -- 근거·비고(위험고지·최소수집 폴백 등)
  voice_record_url text,                                                  -- 음성 동의 녹취(있으면)
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,                                                 -- 철회 시각(철회는 삭제가 아니라 기록)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint consents_version_check
    check (char_length(btrim(version)) between 1 and 40),
  constraint consents_guardian_check
    check (
      subject_type = 'self'
      or (guardian_name is not null and char_length(btrim(guardian_name)) between 1 and 50)
    ),
  constraint consents_guardian_relation_check
    check (guardian_relation is null or char_length(guardian_relation) <= 50),
  constraint consents_basis_check
    check (basis is null or char_length(basis) <= 1000)
);

create index if not exists idx_consents_profile_type
  on public.consents(profile_id, consent_type);
create index if not exists idx_consents_user_id on public.consents(user_id);
create index if not exists idx_consents_org_id on public.consents(org_id);
create index if not exists idx_consents_active
  on public.consents(profile_id, consent_type)
  where revoked_at is null;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 트리거: updated_at, org_id 자동 스탬프, 감사로그
-- ──────────────────────────────────────────────────────────────────────────

create trigger set_consents_updated_at
before update on public.consents
for each row execute function app.set_updated_at();

create trigger stamp_consents_org_id
before insert on public.consents
for each row execute function app.stamp_org_id();

create trigger audit_consents
after insert or update or delete on public.consents
for each row execute function app.write_audit_log();

-- ──────────────────────────────────────────────────────────────────────────
-- 4) RLS: 본인(수집자) + 같은 기관 관리자. 동의 기록은 삭제 불가(철회=revoked_at).
-- ──────────────────────────────────────────────────────────────────────────

alter table public.consents enable row level security;

create policy consents_select_scope
on public.consents
for select
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
);

create policy consents_insert_scope
on public.consents
for insert
with check (user_id = auth.uid() and org_id = app.current_org_id());

create policy consents_update_scope
on public.consents
for update
using (
  user_id = auth.uid()
  or (org_id = app.current_org_id() and app.is_org_admin())
)
with check (
  org_id = app.current_org_id()
  and (user_id = auth.uid() or app.is_org_admin())
);

-- 삭제 정책 없음(deny by default): 동의·철회 이력은 보존한다.
