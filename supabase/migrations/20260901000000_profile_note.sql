-- MemoryOn(기억온) — 어르신 특이사항(profiles.note)
--
-- 신규 웹 디자인의 어르신 상세(161:373)와 기본정보 수정(178:486)이 "특이사항"을 보여 준다.
-- 담을 칸이 없어 상세는 `—`, 폼은 잠긴 입력으로 두었던 것을 실제 컬럼으로 잇는다.
--
-- ⚠️ 돌봄에서 참고할 메모(선호·주의할 점 등)다. **건강 상태를 적는 칸이 아니며**,
--    화면 안내 문구도 그렇게 쓴다(비의료 포지셔닝).
-- append-only. profiles(20260521131723) 이후 적용.

alter table public.profiles
  add column if not exists note text;

alter table public.profiles
  drop constraint if exists profiles_note_check;
alter table public.profiles
  add constraint profiles_note_check
  check (note is null or char_length(note) <= 500);

comment on column public.profiles.note is
  '돌봄에서 참고할 메모(특이사항). 최대 500자. 건강 상태를 적는 칸이 아니다.';
