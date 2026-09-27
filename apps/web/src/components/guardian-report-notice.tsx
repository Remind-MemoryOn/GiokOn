// 보호자 리포트 하단 고정 문구(파일럿 W4 · 계획 §7 "보호자 표현 규칙") — **모든 보호자 리포트 화면에 같은 문장**.
// 문구를 화면마다 적지 말고 이 부품을 쓴다(한 곳에서만 고친다).
import { Y } from '../lib/figmaY';
import { cn } from '../lib/utils';

export const GUARDIAN_REPORT_NOTICE = '본 리포트는 대화 기록 요약이며 진단·평가 목적이 아닙니다.'; // nonmedical-ok — 진단이 아님을 밝히는 계획 §7 고정 문구

/**
 * 카드 폭(1054)에 맞춘 한 줄. `top`(Figma 절대 y)을 주면 좌표 배치(left 322),
 * 없으면 흐름 배치 — 높이가 내용에 따라 변하는 카드 바로 아래에 붙인다.
 */
export function GuardianReportNotice({ top }: { top?: number }) {
  return (
    <p
      role="note"
      className={cn(
        'w-[1054px] text-w-label font-semibold leading-[28px] text-ink-700',
        top != null ? 'absolute left-[322px]' : 'mt-[24px]',
      )}
      style={{ top: top != null ? Y(top) : undefined, wordBreak: 'keep-all' }}
    >
      {GUARDIAN_REPORT_NOTICE}
    </p>
  );
}
