import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.expo',
  '.vercel',
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

console.log(`BOM 검사 통과 (${files.length}개 텍스트/설정 파일)`);
