-- W-6c · Realtime 보강 + W-6d · Storage 업로드 제한
--
-- ── ① Realtime ────────────────────────────────────────────────────────────
-- 지금 publication 에 없는 6종을 더한다. 없으면 **한쪽에서 바꾼 것이 다른 쪽에
-- 안 보인다**: 웹에서 어르신 코드를 회전해도 앱은 옛 코드를 계속 보여 주고,
-- 승인 대기가 승인돼도 요청자 화면은 그대로 pending 이다. 새로고침해야 아는
-- 상태를 "실시간 관리 허브" 라고 부를 수 없다.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'care_journals',        -- 웹에서 쓴 일지 → 목록·공개 화면
    'profile_guardians',    -- 보호자 연결 승인 → 요청자 화면
    'profile_caregivers',   -- 기관 합류 승인 → 요청자 화면
    'consents',             -- 동의 철회 → 진행 가능 여부
    'elder_codes',          -- 코드 회전 → 앱이 든 코드 무효화
    'inquiries'             -- 운영자 답변 → 목록 상태
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;   -- 이미 들어 있으면 그대로 둔다
    end;
  end loop;
end $$;

-- ── ② Storage 업로드 제한 ─────────────────────────────────────────────────
-- 두 버킷 다 제한이 없었다. RLS 는 "누가" 를 막지만 "무엇을 얼마나" 는 막지 못한다 —
-- 담당 요양보호사 계정 하나가 털리면 임의 파일을 무제한으로 올릴 수 있었다.
-- 어르신 사진·일지 사진은 스마트폰 사진 한 장이라 10MB 면 충분하다.
--
-- ⚠️ MIME 은 클라이언트가 보낸 Content-Type 을 믿는 것이라 **위조 가능**하다.
--    실제 방어는 크기 상한 + RLS 경로 규칙이고, allowlist 는 오업로드를 거르는 1차선이다.
-- 로컬 회귀 하네스(PG16)에는 storage 스키마가 없다 — 기존 버킷 마이그레이션과 같은 가드.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets
       set file_size_limit = 10485760,   -- 10 MiB
           allowed_mime_types = array[
             'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
           ]
     where id in ('elder-photos', 'journal-photos');
  end if;
end $$;
