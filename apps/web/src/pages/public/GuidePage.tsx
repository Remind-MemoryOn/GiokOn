// 이용안내 (Figma 1:17 의 좌표 체계 위에 새 내용을 얹은 화면 — 2026-09-03 "C안")
//
// ⚠️ 왜 내용이 바뀌었나: Figma 1:17 은 이용안내 한 화면에 개인정보 처리방침 10항 + 이용약관
//    8조 **전문**을 넣어 둔 구조였다. 그 전문은 2026-09-02 에 `/privacy`·`/terms` 단독
//    페이지로 분리됐고, 이용안내에 그대로 두면 같은 법률 문서가 두 곳에 중복된다.
//    → 내용은 **웹·앱 실제 사용 흐름 안내**로 바꾸고, **치수·색·타이포·좌표 체계는 Figma 그대로** 쓴다.
//
// Figma 에서 그대로 가져온 값(바꾸지 말 것):
//   페이지 열      카드 1204 @ x118 · 본문 열 1055 @ x190 · 배너 1204×69 @ x117
//   세로 리듬      배너 205 · 카드1 330 · 카드 제목 = 카드top+71 · 리드 = +120.32 · 첫 블록 = +218
//                 카드 하단 여백 71 · 카드 사이 간격 72 (Figma 2551→2623)
//   타이포         제목 Bold 30/30 · 리드 20/35 · 본문 20/40 tracking -0.2 · 고지 Bold 20/35
//   색             제목 ink-900 · 본문 ink-700 · 배너 ink-400 + bg #f5f5f5/50 · 고지 accent 10%
//   고지 박스      1059×128 @ x190 r10 border accent · 문구 w987 @ x227, 박스top+30
//
// 카드 높이와 두 번째·세 번째 카드의 y 는 **내용에서 계산된다**(Figma 는 법률 전문 기준의
// 2221/1461 이었다). 그래서 아래 상수로 한곳에서 계산하고, 그 결과를 figma-audit.spec.mjs 가
// 실측으로 되짚는다.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { PublicFooter } from '../../components/shell/PublicFooter';

const Y = (v: number) => v - 122;

// ── Figma 1:17 실측 상수 ────────────────────────────────────────────────
const CARD_X = 118;
const CARD_W = 1204;
const COL_X = 190; // 본문 좌열 (Figma 가 190~199 로 흘려 놓은 것을 190 으로 통일)
const COL_W = 1055;
const TITLE_DY = 71; // 카드 top → 제목
const LEAD_DY = 120.32; // 카드 top → 리드 문단
const FIRST_DY = 218; // 카드 top → 첫 본문 블록 (Figma 330→548)
const CARD_PAD_B = 71; // 마지막 요소 → 카드 bottom
const CARD_GAP = 72; // 카드 사이 (Figma 2551→2623)
const LINE = 40; // 본문 줄 높이
const STEP = 135; // 단계 사이 간격 = 제목 1줄 + 본문 2줄 여유 + 15
const STEP_H = LINE * 2; // 실제 단계 높이 = 제목 1줄 + 본문 1줄 (본문은 1055 폭에서 한 줄에 들어간다)

/** 본문 한 덩어리 — 제목(Bold) + 이어지는 줄(Regular). 줄 간격은 Figma 실측 40. */
function Block({
  fx,
  top,
  title,
  lines,
}: {
  fx: string;
  top: number;
  title?: ReactNode;
  lines: ReactNode[];
}) {
  return (
    <div
      data-fx={fx}
      className="absolute text-[20px] leading-[40px] tracking-[-0.2px]"
      style={{ left: COL_X, top: Y(top), width: COL_W }}
    >
      {title ? <p className="font-bold text-ink-900">{title}</p> : null}
      {lines.map((line, i) => (
        <p key={i} className="text-ink-700" style={{ wordBreak: 'keep-all' }}>
          {line}
        </p>
      ))}
    </div>
  );
}

/** 카드 배경 + 제목 + (선택) 리드 문단. 높이는 호출부가 내용에서 계산해 넘긴다. */
function Card({
  fx,
  fxTitle,
  id,
  top,
  height,
  title,
  lead,
  children,
}: {
  fx: string;
  fxTitle: string;
  id: string;
  top: number;
  height: number;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <section
        id={id}
        data-fx={fx}
        className="absolute rounded-[10px] bg-white shadow-card"
        style={{ left: CARD_X, top: Y(top), width: CARD_W, height }}
        aria-labelledby={`${id}-title`}
      />
      <h2
        id={`${id}-title`}
        data-fx={fxTitle}
        className="absolute whitespace-nowrap text-w-page font-semibold leading-[30px] text-ink-900"
        style={{ left: COL_X, top: Y(top + TITLE_DY) }}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className="absolute text-[20px] leading-[35px] tracking-[-0.2px] text-ink-700"
          style={{ left: COL_X, top: Y(top + LEAD_DY), width: COL_W, wordBreak: 'keep-all' }}
        >
          {lead}
        </p>
      ) : null}
      {children}
    </>
  );
}

// ── 내용 ────────────────────────────────────────────────────────────────
const WEB_STEPS: [string, string][] = [
  [
    '1. 계정과 역할 설정',
    '로그인 후 요양보호사 또는 보호자 역할에 맞는 화면으로 자동 이동합니다.',
  ],
  [
    '2. 어르신과 연대기 관리',
    '요양보호사는 어르신 기본정보와 회상 대화에 사용할 연대기를 등록합니다.',
  ],
  [
    '3. 세션 설계와 기록 확인',
    '웹에서 세션을 준비하고, 앱에서 종료된 대화 기록과 관찰 분석을 확인합니다.',
  ],
  [
    '4. 요양일지와 보호자 공개',
    '실제 돌봄 내용을 일지로 남기고 필요한 항목만 보호자에게 공개합니다.',
  ],
];

const APP_STEPS: [string, string][] = [
  [
    '1. 담당 어르신 선택',
    '요양보호사가 앱에서 대화를 진행할 어르신과 준비된 세션을 선택합니다.',
  ],
  [
    '2. AI 음성 회상 대화',
    '앱이 질문을 읽어주고 어르신의 말씀을 인식해 대화를 이어갑니다. AI와 대화 중임을 화면에 표시합니다.',
  ],
  [
    '3. 안전 확인',
    '위기 관련 표현이 관찰되면 키워드 기반 안전 알림을 요양보호사에게 표시합니다. 의학적 판단이 아닙니다.',
  ],
  [
    '4. 종료 후 동기화',
    '세션 종료 후 대화 기록과 관찰 분석이 웹에 반영됩니다. 분석 근거가 없으면 값을 만들지 않습니다.',
  ],
];

const NOTICES = [
  'AI 생성 질문·요약·번역에는 오류가 있을 수 있어 요양보호사가 확인해야 합니다.',
  '보호자는 요양보호사가 명시적으로 공개한 기록만 볼 수 있습니다.',
  '다른 언어 표시는 한국어 원문을 AI로 번역한 보조본이며, 번역 사실과 기준 언어를 함께 표시합니다.',
];

// ── 세로 좌표 계산 (Figma 리듬으로 내용 길이만큼 쌓는다) ────────────────
const BANNER_Y = 205;

const WEB_TOP = 330;
const WEB_FIRST = WEB_TOP + FIRST_DY; // 548 — Figma 첫 블록과 같다
const WEB_END = WEB_FIRST + (WEB_STEPS.length - 1) * STEP + STEP_H;
const WEB_H = WEB_END - WEB_TOP + CARD_PAD_B;

const APP_TOP = WEB_TOP + WEB_H + CARD_GAP;
const APP_FIRST = APP_TOP + FIRST_DY;
const APP_END = APP_FIRST + (APP_STEPS.length - 1) * STEP + STEP_H;
const APP_H = APP_END - APP_TOP + CARD_PAD_B;

const CHK_TOP = APP_TOP + APP_H + CARD_GAP;
const CHK_FIRST = CHK_TOP + TITLE_DY + 49; // 제목 다음 줄부터(리드 없음)
const CHK_END = CHK_FIRST + NOTICES.length * LINE;
const BOX_Y = CHK_END + 40;
const BOX_H = 128;
const CHK_H = BOX_Y + BOX_H - CHK_TOP + CARD_PAD_B;

const PAGE_H = CHK_TOP + CHK_H + CARD_GAP;

export function GuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto w-full max-w-[1440px]" style={{ height: Y(PAGE_H) }}>
        {/* 법적 문서 안내 — Figma 의 "초안 고지" 배너 자리·치수를 그대로 쓴다.
            처리방침·약관 전문이 단독 페이지로 나갔으므로 그리로 보내는 안내가 된다. */}
        <div
          data-fx="15:320"
          className="absolute left-[117px] h-[69px] w-[1204px] rounded-[10px] border border-ink-400 bg-[#f5f5f5]/50"
          style={{ top: Y(BANNER_Y) }}
        />
        <p
          data-fx="15:321"
          className="absolute left-[273px] w-[893px] text-center text-[20px] leading-[18px] tracking-[-0.2px] text-ink-400"
          style={{ top: Y(231.16) }}
        >
          <Link to="/privacy" className="font-bold underline hover:text-accent">
            개인정보 처리방침
          </Link>
          과{' '}
          <Link to="/terms" className="font-bold underline hover:text-accent">
            이용약관
          </Link>
          은 별도 페이지에서 확인하실 수 있습니다.
        </p>

        {/* ── 관리 웹 사용 방법 ─────────────────────────────────────────── */}
        <Card
          fx="15:324"
          fxTitle="15:319"
          id="web-guide"
          top={WEB_TOP}
          height={WEB_H}
          title="관리 웹 사용 방법"
          lead="요양보호사·기관 관리자·보호자가 PC나 태블릿에서 기록을 관리하는 공간입니다."
        >
          {WEB_STEPS.map(([heading, body], i) => (
            <Block
              key={heading}
              fx={`guide-web-${i + 1}`}
              top={WEB_FIRST + i * STEP}
              title={heading}
              lines={[body]}
            />
          ))}
        </Card>

        {/* ── 어르신 대화 앱 사용 방법 ──────────────────────────────────── */}
        <Card
          fx="15:403"
          fxTitle="15:404"
          id="app-guide"
          top={APP_TOP}
          height={APP_H}
          title="어르신 대화 앱 사용 방법"
          lead="요양보호사의 도움으로 어르신이 AI 음성 회상 대화를 진행하는 모바일 앱입니다."
        >
          {APP_STEPS.map(([heading, body], i) => (
            <Block
              key={heading}
              fx={`guide-app-${i + 1}`}
              top={APP_FIRST + i * STEP}
              title={heading}
              lines={[body]}
            />
          ))}
        </Card>

        {/* ── 꼭 확인해 주세요 ──────────────────────────────────────────── */}
        <Card
          fx="guide-notice-card"
          fxTitle="guide-notice-title"
          id="notice"
          top={CHK_TOP}
          height={CHK_H}
          title="꼭 확인해 주세요"
        >
          <Block fx="guide-notice-list" top={CHK_FIRST} lines={NOTICES.map((n) => `• ${n}`)} />
          {/* 비의료 고지 — Figma 15:440 의 치수·색 그대로 */}
          <div
            data-fx="15:440"
            className="absolute h-[128px] w-[1059px] rounded-[10px] border border-accent bg-accent/10"
            style={{ left: COL_X, top: Y(BOX_Y) }}
          />
          <p
            data-fx="15:438"
            className="absolute left-[227px] w-[987px] text-[20px] font-bold leading-[35px] tracking-[-0.2px] text-ink-900"
            style={{ top: Y(BOX_Y + 30), wordBreak: 'keep-all' }}
          >
            기억온은 의료기기가 아니며, 질병의 판정·의학적 소견 제공을 목적으로 하지 않습니다.
            서비스는 어르신의 회상 대화와 정서 지원을 돕는 인지활동 보조 도구이며, 건강에 관한
            판단·상담은 반드시 의료 전문가에게 받으시기 바랍니다.
          </p>
        </Card>
      </main>
      <PublicFooter />
    </div>
  );
}
