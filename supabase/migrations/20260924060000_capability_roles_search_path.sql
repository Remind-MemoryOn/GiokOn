-- 20260924010000 후속 — 보안 advisor(0011 function_search_path_mutable) 대응.
-- app.default_capability_roles() 는 테이블을 읽지 않는 상수 함수지만, 다른 app 함수들과 같이 search_path 를 고정한다.
-- 본문의 타입은 이미 스키마로 한정돼 있어(public.org_role) 빈 search_path 에서도 같은 값을 돌려준다.
alter function app.default_capability_roles() set search_path = '';
