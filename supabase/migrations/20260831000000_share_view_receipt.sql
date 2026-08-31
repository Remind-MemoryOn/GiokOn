-- MemoryOn(기억온) — 보호자 확인(읽음) 영수증
--
-- 신규 웹 디자인의 세 화면이 이 값을 읽고 쓴다:
--   공개 기록 설정 모달(146:422) — "공개 후 보호자 확인 / 보호자 확인 알림 받기" 토글
--   공개 이력(146:1067) — "보호자 확인" 열
--   확인 정보(153:1811) — 확인여부 · 확인 일시 · 확인 횟수
-- append-only. guardian_shares(20260718150000) 이후 적용.

alter table public.guardian_shares
  add column if not exists viewed_at timestamptz,
  add column if not exists viewed_by uuid references public.users(id) on delete set null,
  add column if not exists view_count integer not null default 0,
  add column if not exists notify_on_view boolean not null default false;

alter table public.guardian_shares
  drop constraint if exists guardian_shares_view_count_check;
alter table public.guardian_shares
  add constraint guardian_shares_view_count_check check (view_count >= 0);

comment on column public.guardian_shares.viewed_at is '보호자가 처음 열어 본 시각(없으면 미확인)';
comment on column public.guardian_shares.view_count is '보호자가 열어 본 횟수(0 = 아직 안 봄)';
comment on column public.guardian_shares.notify_on_view is '보호자가 확인하면 요양보호사에게 알릴지';

-- 확인 기록은 **보호자가** 남긴다. 보호자에게 guardian_shares UPDATE 를 열면 공개·철회까지
-- 손댈 수 있으므로, security definer 함수로 확인 열 3개만 건드린다.
create or replace function public.mark_share_viewed(p_share_id uuid)
returns public.guardian_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.guardian_shares;
begin
  update public.guardian_shares s
     set viewed_at = coalesce(s.viewed_at, now()),
         viewed_by = auth.uid(),
         view_count = s.view_count + 1
   where s.id = p_share_id
     and s.revoked_at is null
     and exists (
       select 1
         from public.profile_guardians pg
        where pg.profile_id = s.profile_id
          and pg.guardian_user_id = auth.uid()
          and pg.status = 'approved'
     )
  returning s.* into v_row;

  if v_row.id is null then
    raise exception '확인을 기록할 수 없는 공개 항목입니다(연결 미승인·철회됨).';
  end if;
  return v_row;
end;
$$;

revoke all on function public.mark_share_viewed(uuid) from public;
grant execute on function public.mark_share_viewed(uuid) to authenticated;
