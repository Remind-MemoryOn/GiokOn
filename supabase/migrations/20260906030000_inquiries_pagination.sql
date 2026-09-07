-- W-5e · 문의 목록 페이지네이션
--
-- 문제: `list_inquiries()` 가 **전량**을 돌려준다. 문의가 쌓이면 목록 한 번에 수천 행을
-- 내려보내게 되고, anon 도 부를 수 있는 함수라 비용·응답시간이 그대로 노출된다.
--
-- 인자를 **기본값과 함께** 더한다 — 기존 호출(`list_inquiries()`)이 그대로 동작해야
-- 배포 순서(DB 먼저 / 웹 먼저)에 상관없이 깨지지 않는다.
-- `total` 을 함께 돌려줘 "더보기"가 남은 개수를 알 수 있게 한다(행마다 같은 값).

create or replace function public.list_inquiries(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  masked_author text,
  visibility public.inquiry_visibility,
  status public.inquiry_status,
  created_at timestamptz,
  reply_count bigint,
  locked boolean,
  total bigint
)
language sql stable security definer set search_path = public as $$
  with viewer as (
    select auth.uid() as uid,
           coalesce((select u.is_site_admin from public.users u where u.id = auth.uid()), false) as is_admin
  )
  select
    i.id,
    case when i.visibility = 'public' or i.author_id = v.uid or v.is_admin
      then i.title else '비공개 문의입니다' end,
    case when i.visibility = 'public' or i.author_id = v.uid or v.is_admin
      then public.mask_inquiry_author(a.name) else '비공개' end,
    i.visibility,
    i.status,
    i.created_at,
    (select count(*) from public.inquiry_replies r where r.inquiry_id = i.id),
    not (i.visibility = 'public' or i.author_id = v.uid or v.is_admin),
    count(*) over () as total
  from public.inquiries i
  join public.users a on a.id = i.author_id
  cross join viewer v
  order by i.created_at desc
  -- 한 번에 100건을 넘기지 않는다(인자를 크게 넣어도 서버가 자른다).
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- 인자 없는 구 시그니처는 더 이상 필요 없다(기본값이 대신한다). 남아 있으면
-- PostgREST 가 어느 쪽을 부를지 모호해져 오류가 난다 → 명시적으로 지운다.
drop function if exists public.list_inquiries();

revoke execute on function public.list_inquiries(integer, integer) from public;
grant execute on function public.list_inquiries(integer, integer) to anon, authenticated;

comment on function public.list_inquiries(integer, integer) is
  '문의 목록(비공개는 제목·작성자를 서버가 가린다). total 은 필터 없는 전체 건수.';
