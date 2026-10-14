// 실제 SVG 렌더링에서 미측정 월을 가로지르는 선이 생기지 않는지 확인한다.
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';

const server = await createServer({ envDir: false, optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { LineChart } = await server.ssrLoadModule('/src/components/charts.tsx');
  const render = points => renderToStaticMarkup(createElement(LineChart, {
    series: [{ label: '관찰값', points }], months: ['1월', '2월', '3월', '4월', '5월'],
  }));
  const gapped = render([20, 40, null, 70, 80]);
  assert.equal((gapped.match(/<polyline\b/g) ?? []).length, 2, '미측정 월 양쪽은 별도 선으로 그려야 함');
  assert.equal((gapped.match(/<circle\b/g) ?? []).length, 4, '관찰된 네 점만 표시해야 함');
  const isolated = render([20, null, 40, null, 80]);
  assert.equal((isolated.match(/<polyline\b/g) ?? []).length, 0, '고립된 점끼리 선을 이어서는 안 됨');
  assert.equal((isolated.match(/<circle\b/g) ?? []).length, 3);
  assert.equal((render([0, 20, 40, 60, 80]).match(/<polyline\b/g) ?? []).length, 1, '실제 0값은 선을 끊지 않음');
  assert.equal((render([null, null, null, null, null]).match(/<(polyline|circle)\b/g) ?? []).length, 0);
  console.log('PASS: 미측정 월에서 추이 선 분리 · 고립된 관찰점 보존 · 실제 0값 연속 · 모두 미측정이면 빈 SVG.');
} finally {
  await server.close();
}
