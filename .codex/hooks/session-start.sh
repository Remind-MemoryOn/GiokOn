#!/bin/bash
# SessionStart 훅 — Claude Code on the web 전용
#
# 역할:
#   1) pnpm 의존성 설치 → web 세션에서 lint/test/build 즉시 동작
#   2) 환경변수(env/secret 설정)로부터 .env 파일 생성 → 비밀을 깃에 커밋하지 않고
#      매 세션 복원. 값이 설정된 변수만 기록(멱등적).
#
# 필요한 환경변수(원격 환경 설정의 env/secret에 등록):
#   SUPABASE_URL              (apps/web + supabase 공용)
#   SUPABASE_PUBLISHABLE_KEY  (apps/web 클라이언트)
#   SUPABASE_SECRET_KEY       (supabase Edge Functions)
#   SUPABASE_JWKS_URL         (supabase — JWT 서명 검증용 공개 키 목록)
#   OPENAI_API_KEY            (선택, Edge Functions — LLM·STT)
#   NCP_CLOVA_CLIENT_ID       (선택, Edge Functions — CLOVA Voice/Speech, X-NCP-APIGW-API-KEY-ID)
#   NCP_CLOVA_CLIENT_SECRET   (선택, Edge Functions — CLOVA Voice/Speech, X-NCP-APIGW-API-KEY)
#   NAVER_CLIENT_ID/SECRET    (선택, Edge Functions — naver-auth 소셜 로그인)
set -euo pipefail

# 로컬(비원격)에서는 건너뛴다 — 로컬 .env 수동 관리를 덮어쓰지 않기 위함
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── 1) 의존성 설치 (컨테이너 캐시 활용 위해 frozen 대신 install) ──────────
if command -v pnpm >/dev/null 2>&1; then
  echo "[session-start] pnpm install..."
  pnpm install --prefer-offline
else
  echo "[session-start] pnpm 미설치 — 의존성 설치 생략"
fi

# ── 2) 환경변수 → .env 생성 ──────────────────────────────────────────────
# 값이 설정된 변수만 한 줄씩 출력(빈 변수는 생략).
emit() {
  local key="$1" val="$2"
  [ -n "$val" ] && printf '%s="%s"\n' "$key" "$val"
  return 0
}

# apps/web/.env — 클라이언트(publishable 키만 노출)
if [ -n "${SUPABASE_URL:-}${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  {
    echo "# 자동 생성됨: .claude/hooks/session-start.sh (환경변수 기반, 커밋 금지)"
    emit "VITE_SUPABASE_URL" "${SUPABASE_URL:-}"
    emit "VITE_SUPABASE_PUBLISHABLE_KEY" "${SUPABASE_PUBLISHABLE_KEY:-}"
  } > apps/web/.env
  echo "[session-start] apps/web/.env 생성 완료"
else
  echo "[session-start] SUPABASE_URL/PUBLISHABLE_KEY 미설정 — apps/web/.env 생략(목업 동작)"
fi

# supabase/.env — Edge Functions secrets (클라이언트 미노출)
if [ -n "${SUPABASE_URL:-}${SUPABASE_SECRET_KEY:-}${OPENAI_API_KEY:-}${NCP_CLOVA_CLIENT_ID:-}${NCP_CLOVA_CLIENT_SECRET:-}${NAVER_CLIENT_ID:-}${NAVER_CLIENT_SECRET:-}" ]; then
  {
    echo "# 자동 생성됨: .claude/hooks/session-start.sh (환경변수 기반, 커밋 금지)"
    emit "SUPABASE_URL" "${SUPABASE_URL:-}"
    emit "SUPABASE_SECRET_KEY" "${SUPABASE_SECRET_KEY:-}"
    emit "SUPABASE_JWKS_URL" "${SUPABASE_JWKS_URL:-}"
    emit "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
    emit "NCP_CLOVA_CLIENT_ID" "${NCP_CLOVA_CLIENT_ID:-}"
    emit "NCP_CLOVA_CLIENT_SECRET" "${NCP_CLOVA_CLIENT_SECRET:-}"
    emit "NAVER_CLIENT_ID" "${NAVER_CLIENT_ID:-}"
    emit "NAVER_CLIENT_SECRET" "${NAVER_CLIENT_SECRET:-}"
  } > supabase/.env
  echo "[session-start] supabase/.env 생성 완료"
else
  echo "[session-start] Supabase/provider secret 미설정 — supabase/.env 생략"
fi

echo "[session-start] 완료"
