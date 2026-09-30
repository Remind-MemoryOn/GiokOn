// 서비스 소개 (Figma 1:13 — 1440×2532 실측)
//   히어로 밴드 0~953: 흰색 → #f8d4b6 세로 그라데이션(52.5% 지점부터 물듦)
//   중간 흰 섹션 953~1542 · 하단 회색(#f8f8f8) 섹션 1542~2531(989 높이, 상단 중앙에 노치)
// 일러스트·장식은 SVG 를 받을 수 없어 export PNG(@4x)에서 실측 좌표로 크롭해 쓴다
// (scripts/crop-web-figma-assets.py). 좌표는 화면 절대값에서 헤더(122)를 뺀 값이다.
import { BookOpenText, Share2 } from 'lucide-react';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { PublicFooter } from '../../components/shell/PublicFooter';
import { asset } from '../../assets/ui';

/** 중간 섹션의 "…싶으신가요?" 3묶음 — [일러스트, 좌표, 문구] */
const PROMPTS = [
  { src: asset.landingSpot1, art: { left: 227, top: 1096, w: 167, h: 121 }, center: 310, width: 276, lines: ['AI 회상 대화 기록을 더 편리하게', '관리하고 싶으신가요?'] },
  { src: asset.landingSpot2, art: { left: 672, top: 1096, w: 111, h: 122 }, center: 719, width: 247, lines: ['요양일지까지 한곳에서', '관리하고 싶으신가요?'] },
  { src: asset.landingSpot3, art: { left: 1078, top: 1110, w: 108, h: 109 }, center: 1128, width: 247, lines: ['보호자와 소중한 기록을 함께', '나누고 싶으신가요?'] },
];

/** 기능 카드 4종 268×318 — 카드 내부 순서는 제목 → 아이콘 → 설명(Figma 실측).
 *  box = Figma 아이콘 박스(4종이 위치·크기가 제각각이다). 에셋은 @4x 크롭이라 사방 1px
 *  여유가 있어(=iconW/H 가 2 크다) **박스 중심에 맞춰** 놓는다. */
const FEATURES = [
  { left: 113, fx: ['13:113', '13:121', '13:125', '13:123'], icon: asset.landingFeatElders, box: [222, 2052, 51, 77], iconW: 53, iconH: 79, title: '어르신 관리', lines: ['어르신 정보와 연대기를', '등록하고 관리'] },
  { left: 427, fx: ['13:127', '13:128', '13:137', '13:129'], icon: asset.landingFeatRecords, box: [522, 2052.62, 75, 75.06], iconW: 77, iconH: 76, title: 'AI 회상 기록', lines: ['회상 대화와 세션 기록을', '확인하고 관리'] },
  { left: 741, fx: ['13:140', '13:141', '13:139', '13:142'], icon: asset.landingFeatAnalysis, box: [843, 2059.63, 64, 58.05], iconW: 66, iconH: 61, title: 'AI 분석', lines: ['대화 내용을 분석하여', '인지 활동을 확인'] },
  { left: 1055, fx: ['13:145', '13:146', '13:133', '13:147'], icon: asset.landingFeatShare, box: [1160.05, 2055.62, 58.12, 69.05], iconW: 60, iconH: 71, title: '보호자 공유', lines: ['공개된 기록을 보호자와', '안전하게 공유'] },
] as const;

const Y = (v: number) => v - 122; // 화면 절대좌표 → main 기준

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto h-[2410px] w-full max-w-[1440px] overflow-hidden">
        {/* 히어로 배경 — 흰색에서 아래로 갈수록 살구빛 */}
        {/* 히어로 밴드는 페이지 최상단(헤더 뒤)부터 953까지다 */}
        <div
          data-fx="5:14"
          className="absolute inset-x-0"
          style={{
            top: Y(0),
            height: 953,
            background: 'linear-gradient(180deg, #ffffff 0%, #ffffff 54.6%, #f7d3b4 100%)',
          }}
        />
        <img
          data-fx="15:231"
          src={asset.landingBars}
          alt=""
          width={1421}
          height={268}
          className="absolute left-[19px]"
          style={{ top: Y(616), width: 1421, height: 268 }}
        />

        {/* 히어로 */}
        <h1
          data-fx="6:28"
          className="absolute left-[118px] w-[571px] text-[48px] font-bold leading-[70px] text-ink-700"
          style={{ top: Y(355) }}
        >
          AI 회상 대화와
          <br />
          요양일지를 더 쉽게 관리하는,
        </h1>
        <img
          data-fx="12:21"
          src={asset.landingWordmarkHero}
          alt="기억온"
          width={263}
          height={41}
          className="absolute left-[118px]"
          style={{ top: Y(515 + (40.117 - 41) / 2), width: 263, height: 41 }}
        />
        <img
          data-fx="8:36"
          src={asset.landingHero}
          alt=""
          width={410}
          height={261}
          className="absolute left-[828px]"
          style={{ top: Y(325), width: 410, height: 261 }}
        />

        {/* 중간 — 세 가지 물음 */}
        {PROMPTS.map((p) => (
          <div key={p.center}>
            <img
              src={p.src}
              alt=""
              width={p.art.w}
              height={p.art.h}
              className="absolute"
              style={{ left: p.art.left, top: Y(p.art.top), width: p.art.w, height: p.art.h }}
            />
            <p
              className="absolute text-center text-w-nav font-semibold leading-[35px] text-ink-700"
              style={{ left: p.center - p.width / 2, top: Y(1252), width: p.width }}
            >
              {p.lines[0]}
              <br />
              {p.lines[1]}
            </p>
          </div>
        ))}
        <img
          data-fx="12:65"
          src={asset.landingWordmarkCta}
          alt="기억온"
          width={205}
          height={33}
          className="absolute left-[483px]"
          style={{ top: Y(1390), width: 205, height: 33 }}
        />
        <p
          data-fx="12:77"
          className="absolute left-[695px] w-[263px] text-[36px] font-bold leading-[70px] text-ink-900"
          style={{ top: Y(1371) }}
        >
          을 이용해보세요!
        </p>

        {/* 하단 회색 섹션 */}
        <div
          data-fx="13:81"
          className="absolute inset-x-0 bg-[#f8f8f8]"
          style={{ top: Y(1542), height: 989 }}
        />
        <img
          src={asset.landingNotch}
          alt=""
          width={190}
          height={98}
          className="absolute left-[630px]"
          style={{ top: Y(1528), width: 190, height: 98 }}
        />
        <h2
          data-fx="13:94"
          className="absolute left-[118px] w-[695px] text-[45px] font-bold leading-[70px] text-ink-900"
          style={{ top: Y(1652) }}
        >
          AI 회상 대화부터 프로그램일지 자동작성까지,
          <br />
          보호자 공유까지, 하나의 인지 활동 관리
          <br />웹 서비스,
        </h2>
        <img
          data-fx="13:101"
          src={asset.landingWordmarkSub}
          alt="기억온"
          width={264}
          height={42}
          className="absolute left-[313.5px]"
          style={{ top: Y(1808 + (40.117 - 42) / 2), width: 264, height: 42 }}
        />
        <img
          data-fx="13:154"
          src={asset.landingIllustShare}
          alt=""
          width={268}
          height={171}
          className="absolute left-[1051px]"
          style={{ top: Y(1675), width: 268, height: 171 }}
        />

        {/* 기능 카드 4종 */}
        {FEATURES.map((f) => (
          <div key={f.title}>
            <div
              data-fx={f.fx[0]}
              className="absolute h-[318px] w-[268px] rounded-[10px] bg-white shadow-card"
              style={{ left: f.left, top: Y(1941) }}
            />
            <p
              data-fx={f.fx[1]}
              className="absolute text-center text-w-section font-semibold leading-[35px] text-ink-700"
              style={{ left: f.left + 10, top: Y(1990), width: 247 }}
            >
              {f.title}
            </p>
            {/* 2·4번 카드는 @4x 크롭이 흐려 lucide 벡터로 대체했다(2026-09-02 사용자 적용).
                박스 좌표는 Figma 실측 그대로고 글리프만 바뀐다. */}
            {f.title === 'AI 회상 기록' ? (
              <BookOpenText
                data-fx={f.fx[2]}
                aria-hidden
                className="absolute text-accent"
                strokeWidth={1.8}
                style={{ left: f.box[0] + 6, top: Y(f.box[1] + 7), width: 64, height: 64 }}
              />
            ) : f.title === '보호자 공유' ? (
              <Share2
                data-fx={f.fx[2]}
                aria-hidden
                className="absolute text-accent"
                strokeWidth={1.8}
                style={{ left: f.box[0] - 3, top: Y(f.box[1] + 5), width: 64, height: 64 }}
              />
            ) : (
              <img
                data-fx={f.fx[2]}
                src={f.icon}
                alt=""
                width={f.iconW}
                height={f.iconH}
                className="absolute"
                style={{
                  left: f.box[0] + (f.box[2] - f.iconW) / 2,
                  top: Y(f.box[1] + (f.box[3] - f.iconH) / 2),
                  width: f.iconW,
                  height: f.iconH,
                }}
              />
            )}
            <p
              data-fx={f.fx[3]}
              className="absolute text-center text-w-body leading-[30px] text-ink-700"
              style={{ left: f.left + 10, top: Y(2157), width: 247 }}
            >
              {f.lines[0]}
              <br />
              {f.lines[1]}
            </p>
          </div>
        ))}

        <p
          data-fx="13:152"
          className="absolute left-[381px] w-[679px] text-center text-[24px] font-semibold leading-[35px] text-ink-700"
          style={{ top: Y(2320) }}
        >
          AI 기반 인지 활동 관리에 필요한 모든 기능을 하나의 웹에서 제공합니다.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
