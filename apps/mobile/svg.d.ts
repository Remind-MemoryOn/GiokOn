// Figma 에서 내보낸 .svg 를 React 컴포넌트로 임포트하기 위한 타입 선언.
// (metro.config.js 가 react-native-svg-transformer 로 변환 — sourceExts 에 svg 추가)
//
//   import Logo from '../assets/figma/logo.svg';
//   <Logo width={132} height={24} />

declare module '*.svg' {
  import type React from 'react';
  import type { SvgProps } from 'react-native-svg';

  const content: React.FC<SvgProps>;
  export default content;
}

// 래스터 에셋(Figma @4x 크롭 등)을 ES import 로 쓰기 위한 선언.
// (Metro 가 asset 모듈로 해석 — Image source 에 그대로 전달한다.)
declare module '*.png' {
  const content: number;
  export default content;
}
declare module '*.jpg' {
  const content: number;
  export default content;
}
