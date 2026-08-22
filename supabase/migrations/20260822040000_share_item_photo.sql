-- MemoryOn(기억온) — 공개 항목 유형에 '사진' 추가 (신규 웹 디자인 55:2035 공유 사진)
--
-- 보호자 화면의 "공유 사진" 은 요양일지에 첨부한 사진을 날짜순으로 본다. 일지 전체를
-- 공개하지 않고 **사진만** 공개하는 경우가 있어 공개 항목 유형을 하나 더 둔다.
--
-- ⚠️ enum 값 추가는 같은 트랜잭션에서 그 값을 쓸 수 없어 파일을 따로 둔다
--    (20260822010000_session_status_planned 와 같은 이유).

alter type public.share_item_type add value if not exists 'photo';
