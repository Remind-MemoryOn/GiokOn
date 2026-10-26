// Real React/Query browser regression; all identities/data are synthetic. No dotenv.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const authModule = '\0auth-fixture';
const entryModule = '/__auth-test.jsx';
const server = await createServer({
  root, configFile: false, envDir: false,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.invalid'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic') },
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'synthetic-auth-only', enforce: 'pre',
    resolveId(source, importer) {
      if (source === '@giokon/data' && importer?.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) return authModule;
      if (source === entryModule) return entryModule;
    },
    load(id) {
      if (id === authModule) return `
        let callback;
        window.authTest = { rows: {}, rendered: [], clients: [],
          emit: session => callback('SIGNED_IN', session),
          initial: new Promise(resolve => { window.resolveInitial = resolve; }),
        };
        export const getSession = () => window.authTest.initial;
        export const onAuthStateChange = fn => { callback = fn; return {unsubscribe() {}}; };
        export const getCurrentUserRow = () => window.authTest.row;
        export const signOut = async () => { throw new Error('synthetic offline'); };
      `;
      if (id === entryModule) return `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQuery, useQueryClient } from '@tanstack/react-query';
        import { AuthProvider, useAuth } from '/src/auth/AuthProvider.tsx';
        import { useStore } from '/src/store/store.ts';
        function Private() {
          const {user, userRow} = useAuth();
          const [formName] = useState(userRow.name);
          const client = useQueryClient();
          if (!window.authTest.clients.includes(client)) window.authTest.clients.push(client);
          const {data} = useQuery({queryKey: ['profiles'], queryFn: async () => window.authTest.rows[user.id]});
          window.authTest.rendered.push({uid:user.id, name:userRow.name, formName, data});
          return <div id="private">{userRow.name}|{formName}|{data?.name}|{data?.photo}</div>;
        }
        function App() {
          const auth = useAuth();
          window.authTest.logout = auth.signOut;
          window.authTest.refresh = auth.refreshUserRow;
          window.authTest.toasts = useStore.getState;
          window.authTest.toast = useStore.getState().toast;
          if (auth.loading) return <div>loading</div>;
          if (!auth.user || !auth.userRow) return <div>signed out</div>;
          return <Private/>;
        }
        createRoot(document.getElementById('root')).render(<AuthProvider><App/></AuthProvider>);
      `;
    },
    configureServer(dev) {
      dev.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__auth-test') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await dev.transformIndexHtml('/__auth-test', '<div id="root"></div><script type="module" src="/__auth-test.jsx"></script>'));
      });
    },
  }, react()],
});
let browser;
try {
  await server.listen();
  // 다른 브라우저 스위트와 같이 설치된 브라우저 경로(CHROMIUM_PATH)를 따른다 — 없으면 Playwright 기본값(CI).
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}__auth-test`);
  await page.waitForFunction(() => window.authTest?.logout);
  await page.evaluate(() => {
    const row = id => ({id, name: id, org_id: 'org', role: 'caregiver', onboarded_at: 'date'});
    window.authTest.row = row('A');
    window.authTest.rows.A = {name:'record-A', photo:'signed-A'};
    window.authTest.emit({user:{id:'A'}});
    window.resolveInitial(null); // Initial getSession must not overwrite the newer login.
  });
  await page.waitForFunction(() => document.querySelector('#private')?.textContent === 'A|A|record-A|signed-A');
  await page.evaluate(() => {
    window.authTest.oldToast = window.authTest.toast;
    window.authTest.row = new Promise(resolve => { window.resolveOld = resolve; });
    void window.authTest.refresh();
    window.authTest.row = new Promise(resolve => { window.resolveB = resolve; });
    window.authTest.rows.B = new Promise(resolve => { window.resolveRowsB = resolve; });
    window.authTest.emit({user:{id:'B'}});
    window.authTest.clients[0].setQueryData(['profiles'], {name:'late-A', photo:'late-signed-A'});
  });
  await page.waitForFunction(() => !document.querySelector('#private'));
  await page.evaluate(() => window.resolveB({id:'B', name:'B', org_id:'org', role:'caregiver', onboarded_at:'date'}));
  await page.waitForFunction(() => document.querySelector('#private')?.textContent === 'B|B||');
  await page.evaluate(() => {
    window.resolveOld({id:'A', name:'private-A', org_id:'org', role:'caregiver', onboarded_at:'date'});
    window.resolveRowsB({name:'record-B', photo:'signed-B'});
  });
  await page.waitForFunction(() => document.querySelector('#private')?.textContent === 'B|B|record-B|signed-B');
  await page.evaluate(() => window.authTest.oldToast('error', 'private-A-error'));
  assert.deepEqual(await page.evaluate(() => window.authTest.toasts().toasts), []);
  const leaked = await page.evaluate(() => window.authTest.rendered.filter(item => item.uid === 'B' &&
    [item.name, item.formName, item.data?.name, item.data?.photo].some(value => value?.includes('A'))));
  assert.deepEqual(leaked, [], 'B rendered private content from A');
  await page.evaluate(() => window.authTest.logout().catch(() => {}));
  await page.waitForFunction(() => document.body.textContent === 'signed out');
  assert.deepEqual(errors, []);
  console.log('PASS: real React account/cache/form isolation, delayed old writes, offline logout, initial-session race');
} finally {
  await browser?.close();
  await server.close();
}
