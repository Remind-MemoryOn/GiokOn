// Google Play AI 생성 콘텐츠 정책 — 앱 안에서 AI 응답을 신고할 수 있어야 한다(2026-11-27).
// 신고 진입점이 화면에서 빠지면 심사 기준을 잃으므로 소스로 고정한다. 신고 동작 자체는
// packages/data supportRequests.test.ts 가 검사한다.
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('AI 응답 신고 진입점', () => {
  it('요양보호사 대화 화면: 보이는 AI 발화가 있을 때 질문 카드 아래 신고 링크 + 시트', () => {
    const talk = src('../../../app/session/talk.tsx');
    expect(talk).toMatch(/\{question \? \(\s*<View[^>]*>\s*<AiReportLink/);
    expect(talk).toContain('<AiReportSheet target={reportTarget}');
  });
  it('대화 기록: AI 말풍선마다 신고 링크(저장된 턴 id·세션 id 포함)', () => {
    const log = src('../../../app/log/[id].tsx');
    expect(log).toContain('<AiReportLink label="신고"');
    expect(log).toMatch(/setReportTarget\(\{ aiText: t\.text, sessionId: id \?\? null, turnId: t\.id/);
    expect(log).toContain('<AiReportSheet target={reportTarget}');
  });
  it('어르신 화면에는 신고 UI 를 두지 않는다(대화만 보이는 단순 화면)', () => {
    expect(src('../session/ElderView.tsx')).not.toContain('AiReport');
  });
});
