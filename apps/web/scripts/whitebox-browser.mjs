// Existing synthetic browser suites, instrumented in memory; product files stay intact.
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { finish } from './whitebox-browser-runtime.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const target = pathToFileURL(join(here, process.argv[2])).href;
const runtime = pathToFileURL(join(here, 'whitebox-browser-runtime.mjs')).href;
process.chdir(resolve(here, '..'));
registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (url !== target) return loaded;
  let source = loaded.source.toString();
  let wrappers = '';
  source = source.replace(/import \{([^}]+)\} from 'vite';/, (full, imports) => {
    const names = imports.replace(/\bbuild\b/, 'build as whiteboxBuild').replace(/\bcreateServer\b/, 'createServer as whiteboxServer');
    if (/\bbuild\b/.test(imports)) wrappers += 'const build = wrapBuild(whiteboxBuild);\n';
    if (/\bcreateServer\b/.test(imports)) wrappers += 'const createServer = wrapBuild(whiteboxServer);\n';
    return `import {${names}} from 'vite';`;
  });
  source = `import { wrapBuild, wrapChromium } from ${JSON.stringify(runtime)};\n${wrappers}${source}`;
  source = source.replace(/(import \{ chromium \} from 'playwright';)/, '$1\nwrapChromium(chromium);');
  return { ...loaded, source };
} });
try { await import(target); } finally { await finish(); }
