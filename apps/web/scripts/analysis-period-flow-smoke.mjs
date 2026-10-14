// 분석 기간 회귀 — 실제 화면 + 합성 캐시. 환경 파일과 운영 데이터는 읽지 않는다.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { selectValue } from './select-control.mjs';

const outDir = await mkdtemp(join(tmpdir(), 'giokon-analysis-period-'));
await build({ envDir: false, mode: 'figma', build: { outDir, emptyOutDir: false }, logLevel: 'error' });
const server = await preview({ envDir: false, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Seoul' });
  await page.clock.install({ time: new Date('2026-10-14T03:00:00Z') });
  await page.route('https://**/*', route => route.abort());
  const go = async path => {
    await page.goto(base + path);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(() => {
      const q = window.__giokonQC;
      const analyses = q.getQueryData(['session_analyses', 'org', 'all']);
      const template = analyses[0];
      const fixture = [
        { id: 'recent', at: '2026-10-01T03:00:00Z', topic: '최근 주제', keyword: '최근키워드', rate: 0.8 },
        { id: 'old', at: '2026-05-20T03:00:00Z', topic: '오래된 주제', keyword: '오래된키워드', rate: 0.4 },
        { id: 'ancient', at: '2025-01-01T03:00:00Z', topic: '기간 밖 주제', keyword: '기간밖키워드', rate: 0.1 },
      ];
      const rows = fixture.map(f => ({ ...template, id: f.id, profile_id: 'e1', session_id: f.id, created_at: f.at,
        analysis: { ...template.analysis, topicsEngaged: [f.topic], topicsLow: [], topicOutcomes: [], interestKeywords: [f.keyword],
          metrics: { ...template.analysis.metrics, responseRate: f.rate } } }));
      q.setQueryData(['session_analyses', 'org', 'all'], rows);
      q.setQueryData(['session_analyses', 'e1'], rows);
      const session = q.getQueryData(['sessions', 'e1'])[0];
      const sessions = fixture.map((f, i) => ({ ...session, id: f.id, status: 'ended', started_at: f.at, ended_at: f.at, duration_seconds: (i + 1) * 600 }));
      q.setQueryData(['sessions', 'recent', 'all'], sessions);
      q.setQueryData(['sessions', 'e1'], sessions);
    });
  };
  await go('/caregiver/analysis');
  await page.getByText('최근 주제', { exact: true }).first().waitFor();
  assert.match(await page.locator('[data-fx="228:3206"]').innerText(), /최근 3개월 동안 1건의 대화가 분석됐습니다\./, '선택 기간 밖 분석을 최근 건수에 포함하면 안 됨');
  assert.equal(await page.getByText('오래된 주제', { exact: true }).count(), 0);
  assert.equal(await page.getByText('#오래된키워드', { exact: true }).count(), 0);
  assert.match(await page.locator('[data-fx="228:2945"]').innerText(), /1\s*회/);
  assert.match(await page.locator('[data-fx="228:2968"]').innerText(), /80\s*%/);
  await selectValue(page, '분석 기간', '6');
  await page.getByText('최근 6개월 동안 2건의 대화가 분석됐습니다.', { exact: false }).waitFor();
  await page.getByText('#오래된키워드', { exact: true }).waitFor();
  assert.match(await page.locator('[data-fx="228:2945"]').innerText(), /2\s*회/);
  assert.match(await page.locator('[data-fx="228:2968"]').innerText(), /60\s*%/);
  assert.equal(await page.getByText('기간 밖 주제', { exact: true }).count(), 0);
  await selectValue(page, '상세를 볼 주제', '오래된 주제');
  await selectValue(page, '분석 기간', '3');
  assert.equal(await page.getByRole('combobox', { name: '상세를 볼 주제', exact: true }).innerText(), '최근 주제', '기간을 줄이면 범위 밖 주제 선택도 현재 목록으로 돌아와야 함');

  for (const path of ['/caregiver/analysis/e1', '/guardian/analysis?state=connected']) {
    await go(path);
    await page.getByText('최근 주제', { exact: true }).waitFor();
    assert.equal(await page.getByText('오래된 주제', { exact: true }).count(), 0, `${path}: 선택 기간 밖 주제를 요약에 포함하면 안 됨`);
    await selectValue(page, '분석 기간', '6');
    await page.getByText('오래된 주제', { exact: true }).waitFor();
    assert.equal(await page.getByText('기간 밖 주제', { exact: true }).count(), 0);
  }
  console.log('PASS: 전체·개인·보호자 분석 3→6개월 선택 시 횟수·응답률·주제·키워드·요약의 기간 일치. 합성 캐시만 사용.');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
