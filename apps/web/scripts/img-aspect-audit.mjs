// 이미지 왜곡 검사 — 렌더된 <img> 가 **원본 비율을 유지하는가**.
//
// 왜 필요한가: Tailwind preflight 가 `img { height: auto }` 를 깔아 HTML 의
// `height="19"` 속성을 덮는다. 그래서 아이콘이 `align-items: stretch`(flex 기본)인
// 행에 들어가면 **행 높이만큼 세로로 늘어난다** — 코드만 봐서는 height 가 박혀 있어
// 멀쩡해 보이므로 리뷰에서 잘 안 잡힌다.
//
// 실제로 대시보드 "담당 어르신" 행의 12×19 chevron 이 **12×75** 로 렌더되고 있었고
// (2026-09-07 사용자 신고), `check:figma-web` 의 1511 프로브는 그 아이콘에 `data-fx`
// 가 없어 보지 못했다. 좌표를 재는 대신 **비율이 깨졌는지**를 보면 앵커 없이도 잡힌다.
//
// 판정: **object-fit:fill(기본)** 인 이미지만 본다 — 그때만 상자 비율이 곧 그림 비율이다.
// |렌더 비율 − 원본 비율| 이 3% 를 넘으면 왜곡. 서브픽셀·반올림은 통과시킨다.
//
// 사용: pnpm -F @giokon/web img:audit   (figma:build 로 만든 dist-audit 을 쓴다)
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SPEC = join(process.env.AUDIT_OUT || join(tmpdir(), 'giokon-audit'), 'spec.json');
const TOLERANCE = 0.03; // 비율 3%

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const p = typeof a === 'object' && a ? a.port : 4412;
      s.close((e) => (e ? reject(e) : resolve(p)));
    });
  });
}

const SELF = !process.env.BASE_URL;
const PORT = SELF ? await freePort() : Number(process.env.PORT || 4412);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

const reachable = async (u) => {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(1500) });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
};

let child = null;
if (SELF) {
  if (!existsSync(new URL('../dist-audit/index.html', import.meta.url))) {
    console.error('✗ dist-audit 이 없습니다 — 먼저 `pnpm -F @giokon/web figma:build`.');
    process.exit(1);
  }
  child = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--outDir', 'dist-audit', '--port', String(PORT), '--strictPort'],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' },
  );
  let up = false;
  for (let i = 0; i < 60; i++) {
    if (await reachable(BASE)) { up = true; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    child.kill();
    console.error(`✗ preview 가 ${BASE} 에서 뜨지 않았습니다.`);
    process.exit(1);
  }
}

if (!existsSync(SPEC)) {
  child?.kill();
  console.error(`✗ ${SPEC} 이 없습니다 — 먼저 \`pnpm -F @giokon/web figma:shots\`.`);
  process.exit(1);
}
const routes = [...new Set(JSON.parse(readFileSync(SPEC, 'utf8')).map((s) => s.route))];

const exe = process.env.CHROMIUM_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe }
  : process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

const bad = new Map();
let checked = 0;

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(120);
  const rows = await page.evaluate((tol) => {
    const out = [];
    let n = 0;
    for (const img of document.querySelectorAll('img')) {
      // 원본 비율을 모르면(로드 실패·SVG 등) 판정하지 않는다.
      if (!img.naturalWidth || !img.naturalHeight) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // object-fit 이 fill(기본) 이 아니면 상자 비율과 무관하게 원본 비율이 지켜진다
      // (contain·scale-down·none 은 레터박스, cover 는 잘라내기). 상자만 재는 이 검사로는
      // 판정할 수 없으므로 건너뛴다 — 여기서 거르지 않으면 사이드바 아이콘이 전부 오탐이다.
      if (getComputedStyle(img).objectFit !== 'fill') continue;
      n += 1;
      const natural = img.naturalWidth / img.naturalHeight;
      const rendered = r.width / r.height;
      const drift = Math.abs(rendered - natural) / natural;
      if (drift > tol) {
        out.push({
          src: (img.getAttribute('src') || '').split('/').pop().slice(-28),
          natural: `${img.naturalWidth}x${img.naturalHeight}`,
          rendered: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
          drift: (drift * 100).toFixed(0),
          cls: (img.getAttribute('class') || '').slice(0, 64),
          parent: (img.parentElement?.getAttribute('class') || '').slice(0, 64),
        });
      }
    }
    return { out, n };
  }, TOLERANCE);
  checked += rows.n;
  for (const r of rows.out) {
    const key = `${r.src}|${r.rendered}|${r.cls}`;
    if (!bad.has(key)) bad.set(key, { ...r, routes: [] });
    if (!bad.get(key).routes.includes(route)) bad.get(key).routes.push(route);
  }
}

await browser.close();
child?.kill();

if (bad.size === 0) {
  console.log(`✓ 이미지 비율 통과 (${routes.length}화면 · ${checked}개 이미지 · 허용 ${TOLERANCE * 100}%)`);
  process.exit(0);
}

console.error('✗ 원본 비율이 깨진 이미지:\n');
for (const b of bad.values()) {
  console.error(`  ${b.src}  원본 ${b.natural} → 렌더 ${b.rendered}  (${b.drift}% 왜곡)`);
  console.error(`     class : ${b.cls}`);
  console.error(`     parent: ${b.parent}`);
  console.error(`     route : ${b.routes.slice(0, 3).join(', ')}${b.routes.length > 3 ? ` 외 ${b.routes.length - 3}` : ''}\n`);
}
console.error('대개 flex 부모의 stretch 때문이다 — 이미지에 `self-start`(또는 부모에 items-*)를 준다.');
console.error('preflight 의 img{height:auto} 가 height 속성을 덮으므로 속성만으로는 못 막는다.');
process.exit(1);
