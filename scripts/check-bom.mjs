import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.expo',
  '.vercel',
  'tmp',
  '.tmp',
]);

const TEXT_EXTS = new Set([
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.md',
  '.sql',
  '.html',
  '.css',
]);

const ROOT_TEXT_FILES = new Set([
  'CLAUDE.md',
  'PLAN.md',
  'README.md',
  'INSTRUCTIONS.md',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
]);

function shouldScan(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (ROOT_TEXT_FILES.has(rel)) return true;
  return TEXT_EXTS.has(path.extname(filePath));
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const filePath = path.join(dir, entry.name);
    if (shouldScan(filePath)) out.push(filePath);
  }
}

const files = [];
await walk(ROOT, files);

const offenders = [];
for (const file of files) {
  const buf = await readFile(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    offenders.push(path.relative(ROOT, file));
  }
}

if (offenders.length > 0) {
  console.error('UTF-8 BOM 이 감지됐습니다. Metro/EAS JSON 파싱 오류를 유발합니다:');
  for (const f of offenders) console.error(`- ${f}`);
  console.error('\n수정: UTF-8 with BOM 이 아닌 UTF-8(no BOM)으로 다시 저장하세요.');
  process.exit(1);
}

// ── 한글 깨짐(mojibake) 검사 ────────────────────────────────────────────────
// UTF-8 로 저장된 한글을 CP949 로 읽어 되쓰면 `?대Ⅴ` `?붿뼇` 처럼 **물음표 바로 뒤에
// 한글 음절**이 붙는 형태로 망가진다(PowerShell 로 JSON 을 재작성할 때 실제로 발생 —
// apps/mobile/package.json 의 description 이 이렇게 깨져 있었다).
// BOM 검사만으로는 잡히지 않아 게이트를 통과해 버렸다.
// 정상 한국어에서 `?` 뒤에는 공백·따옴표·줄바꿈이 오므로 이 패턴은 사실상 깨짐이다.
//
// 한 줄에 **2개 이상** 일 때만 잡는다 — 정규식 문자클래스(`[.!?다요음됨함]`)처럼 우연히
// 한 번 걸리는 정상 코드가 있고, 실제 깨짐은 한 줄에 촘촘히 나타나기 때문이다
// (package.json 사례는 한 줄에 5개였다). 이 파일 자신은 패턴 예시를 담고 있어 제외한다.
const MOJIBAKE = /\?[가-힣]/g;
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const mangled = [];
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === SELF) continue;
  const text = await readFile(file, 'utf8');
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if ((line.match(MOJIBAKE) ?? []).length >= 2) {
      mangled.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      break;
    }
  }
}

if (mangled.length > 0) {
  console.error('한글이 깨진(mojibake) 것으로 보이는 파일이 있습니다:');
  for (const f of mangled) console.error(`- ${f}`);
  console.error(
    '\n원인: UTF-8 파일을 CP949 로 읽고 다시 쓴 경우(예: PowerShell 로 JSON 재작성).' +
      '\n수정: 편집기에서 UTF-8 로 열어 원문을 복구한 뒤 UTF-8(no BOM)으로 저장하세요.',
  );
  process.exit(1);
}

console.log(`BOM·인코딩 검사 통과 (${files.length}개 텍스트/설정 파일)`);
