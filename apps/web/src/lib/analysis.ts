// 분석 화면 공용 상수 — 요양보호사(228:4091)와 보호자(96:94)가 같은 기간 선택을 쓴다.
// (컴포넌트 파일에 두면 react-refresh 가 막는다 → 별도 모듈.)

/** 기간 pill 선택지(개월). 시안은 "최근 3개월" 한 상태만 그렸다. */
export const PERIODS = [3, 6, 12] as const;
export type Months = (typeof PERIODS)[number];

/** 화면 절대 y → 본문 컨테이너 좌표(탑바 122 를 되뺀다). */
export const Y = (v: number) => v - 122;
