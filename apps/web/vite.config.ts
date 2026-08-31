import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// 화면에 쓰는 버전은 package.json 이 근거다(자리표시자를 넣지 않는다).
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

// FIGMA_AUDIT=1 빌드에서만 인증·데이터를 감사용 스텁으로 갈아끼운다.
// (가드 뒤 화면을 실좌표로 재려면 로그인 상태와 데모 데이터가 필요하다.
//  제품 빌드에는 영향이 없다 — scripts/figma-audit.mjs 참고.)
const auditAlias = process.env.FIGMA_AUDIT
  ? [
      {
        find: /^(?:\.{1,2}\/)+auth\/AuthProvider$/,
        replacement: fileURLToPath(new URL('./src/audit/auth-stub.tsx', import.meta.url)),
      },
    ]
  : []

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: auditAlias },
})
