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

# Supabase 심(auth.users·auth.uid()·authenticated 롤).
"${PSQL[@]}" -q -f "$HERE/_supabase_shims.sql"

# 마이그레이션 버전 중복 금지 — Supabase 는 파일명 앞 숫자를 이력 ID 로 쓴다. 같은 번호가 둘이면
# 이력 기록·db push 가 깨진다(2026-09-24 jinwoo 브랜치에서 실제로 겹쳤다).
DUP=$(ls "$MIG"/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d)
if [ -n "$DUP" ]; then
  echo "마이그레이션 버전 중복: $DUP" >&2
  exit 1
fi

# 마이그레이션 순차 적용.
for f in "$MIG"/*.sql; do
  "${PSQL[@]}" -q -f "$f"
done

# authenticated 롤 권한 부여(테이블 생성 후) → 회귀 테스트.
"${PSQL[@]}" -q -f "$HERE/_grants.sql"
"${PSQL[@]}" -f "$HERE/rls_regression.sql"
"${PSQL[@]}" -f "$HERE/transcript_provenance.sql"
"${PSQL[@]}" -f "$HERE/pilot_access.sql"
"${PSQL[@]}" -f "$HERE/legal_consents.sql"
"${PSQL[@]}" -f "$HERE/journal_worker.sql"
"${PSQL[@]}" -f "$HERE/safety_push.sql"
"${PSQL[@]}" -f "$HERE/safety_evidence.sql"
"${PSQL[@]}" -f "$HERE/storage_policies.sql"
