import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const bundledPython = join(
  homedir(),
  '.cache',
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies',
  'python',
  'python.exe',
);
const python = process.env.GIOKON_AUDIT_PYTHON
  ?? (process.platform === 'win32' && existsSync(bundledPython) ? bundledPython : undefined)
  ?? (process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(python, ['scripts/figma-ink.py', ...process.argv.slice(2)], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PYTHONUTF8: '1' },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
