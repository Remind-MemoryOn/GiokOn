// Figma 화면 절대좌표 → 본문(main) 기준 y. 상단 바(h122) 아래에서 본문이 시작하므로 122 를 뺀다.
// 좌표를 화면 절대값으로 적는 Figma 이관 화면들이 같이 쓴다.
// (서비스 소개 `LandingPage` 는 check:design 이 자기 정의를 고정해 두어 제 정의를 유지한다.)
export const Y = (v: number) => v - 122;
