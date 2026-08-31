// 화면에 표시하는 웹 버전 — `apps/web/package.json` 의 version 을 vite define 으로 주입한다.
// 시안의 `v.1.0.0` 은 예시값이라 그대로 쓰지 않는다(자리표시자 금지).
declare const __APP_VERSION__: string;

export const APP_VERSION = `v.${__APP_VERSION__}`;
