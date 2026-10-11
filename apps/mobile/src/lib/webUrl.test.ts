import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WEB_ROUTES } from './webUrl';

// 앱이 여는 웹 경로가 실제 웹 라우트와 같은지 — 경로가 어긋나면 앱의 링크가 404 로 간다(재설정 메일 사고).
const web = (path: string) => readFileSync(new URL(`../../../web/src/${path}`, import.meta.url), 'utf8');
const APP = web('App.tsx');
/** 동의서 상세는 `/consents/:documentId` 한 라우트가 문서 슬러그로 나눈다. */
const LEGAL = web('pages/public/LegalPages.tsx');
const CONSENT = /^\/consents\/([a-z-]+)$/;

describe('WEB_ROUTES', () => {
  it.each(Object.entries(WEB_ROUTES))('%s(%s) 는 웹에 같은 경로가 있다', (_name, path) => {
    const consent = CONSENT.exec(path);
    if (consent) {
      expect(APP).toContain('path="/consents/:documentId"');
      expect(LEGAL).toContain(`'${consent[1]}'`);
      return;
    }
    expect(APP).toContain(`path="${path}"`);
  });
});
