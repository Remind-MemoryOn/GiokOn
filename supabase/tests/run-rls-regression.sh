#!/usr/bin/env bash
# MemoryOn(기억온) — RLS 회귀 테스트 로컬/CI 러너 (T10.4 / M13.3)
#
# 임시 PostgreSQL 클러스터를 띄우고, Supabase auth 심 + 전체 마이그레이션 +
# rls_regression.sql 을 적용해 테넌트 격리·RBAC·동의·감사 불변식을 검증한다.
# Supabase 프로젝트가 없어도(컨테이너 egress 차단 환경 포함) 실행 가능.
#
# 요구: postgresql-16 서버 바이너리(initdb/pg_ctl/psql). 비루트 실행 권장.
# 사용: bash supabase/tests/run-rls-regression.sh
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"
BASE="$(mktemp -d)"
PORT="${PGPORT:-5455}"

# postgres 서버는 root 로 실행 불가. root 면 postgres 시스템 계정으로 위임.
RUNAS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres:postgres "$BASE"
  RUNAS=(runuser -u postgres --)
fi
PSQL=("${RUNAS[@]}" "$PGBIN/psql" -h "$BASE" -p "$PORT" -U postgres -v ON_ERROR_STOP=1)

cleanup() {
  "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$BASE/data" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$BASE"
}
trap cleanup EXIT

"${RUNAS[@]}" "$PGBIN/initdb" -D "$BASE/data" -U postgres --auth=trust >"$BASE/initdb.log" 2>&1
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$BASE/data" \
  -o "-k $BASE -p $PORT -c listen_addresses=''" -l "$BASE/pg.log" start >/dev/null
sleep 1

# Supabase 심: auth 스키마·auth.users·auth.uid()(테스트용 GUC 기반) + authenticated 롤.
"${PSQL[@]}" -q <<'SQL'
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
SQL

# 마이그레이션 순차 적용.
for f in "$MIG"/*.sql; do
  "${PSQL[@]}" -q -f "$f"
done

# authenticated 롤에 권한 부여(가입 트리거로 테이블 생성 후).
"${PSQL[@]}" -q <<'SQL'
grant usage on schema public, app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
SQL

# 회귀 테스트.
"${PSQL[@]}" -f "$HERE/rls_regression.sql"
