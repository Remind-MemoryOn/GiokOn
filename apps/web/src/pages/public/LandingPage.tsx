// 서비스 소개 (Figma 1:13 — 1440×2532 실측)
//   히어로 밴드 0~953: 흰색 → #f8d4b6 세로 그라데이션(52.5% 지점부터 물듦)
//   중간 흰 섹션 953~1542 · 하단 회색(#f8f8f8) 섹션 1542~2531(상단 중앙에 노치)
// 일러스트·장식은 SVG 를 받을 수 없어 export PNG(@4x)에서 실측 좌표로 크롭해 쓴다
// (scripts/crop-web-figma-assets.py). 좌표는 화면 절대값에서 헤더(122)를 뺀 값이다.
import { PublicHeader } from '../../components/shell/PublicHeader';
import { asset } from '../../assets/ui';

/** 중간 섹션의 "…싶으신가요?" 3묶음 — [일러스트, 좌표, 문구] */
const PROMPTS = [
  { src: asset.landingSpot1, art: { left: 227, top: 1096, w: 167, h: 121 }, center: 310, width: 276, lines: ['AI 회상 대화 기록을 더 편리하게', '관리하고 싶으신가요?'] },
  { src: asset.landingSpot2, art: { left: 672, top: 1096, w: 111, h: 122 }, center: 719, width: 247, lines: ['요양일지까지 한곳에서', '관리하고 싶으신가요?'] },
  { src: asset.landingSpot3, art: { left: 1078, top: 1110, w: 108, h: 109 }, center: 1128, width: 247, lines: ['보호자와 소중한 기록을 함께', '나누고 싶으신가요?'] },
];

/** 기능 카드 4종 268×318 — 카드 내부 순서는 제목 → 아이콘 → 설명(Figma 실측) */
const FEATURES = [
  { left: 113, icon: asset.landingFeatElders, iconW: 53, iconH: 79, title: '어르신 관리', lines: ['어르신 정보와 연대기를', '등록하고 관리'] },
  { left: 427, icon: asset.landingFeatRecords, iconW: 77, iconH: 76, title: 'AI 회상 기록', lines: ['회상 대화와 세션 기록을', '확인하고 관리'] },
  { left: 741, icon: asset.landingFeatAnalysis, iconW: 66, iconH: 61, title: 'AI 분석', lines: ['대화 내용을 분석하여', '인지 활동을 확인'] },
  { left: 1055, icon: asset.landingFeatShare, iconW: 60, iconH: 71, title: '보호자 공유', lines: ['공개된 기록을 보호자와', '안전하게 공유'] },
];

const Y = (v: number) => v - 122; // 화면 절대좌표 → main 기준

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto h-[2410px] w-full max-w-[1440px] overflow-hidden">
        {/* 히어로 배경 — 흰색에서 아래로 갈수록 살구빛 */}
        {/* 히어로 밴드는 페이지 최상단(헤더 뒤)부터 953까지다 */}
        <div
          className="absolute inset-x-0"
          style={{
            top: Y(0),
            height: 953,
            background: 'linear-gradient(180deg, #ffffff 0%, #ffffff 54.6%, #f7d3b4 100%)',
          }}
        />
        <img
          src={asset.landingBars}
          alt=""
          width={1421}
          height={268}
          className="absolute left-[19px]"
          style={{ top: Y(616), width: 1421, height: 268 }}
        />

        {/* 히어로 */}
        <h1
          className="absolute left-[118px] w-[571px] text-[48px] font-bold leading-[70px] text-ink-700"
          style={{ top: Y(355) }}
        >
          AI 회상 대화와
          <br />
          요양일지를 더 쉽게 관리하는,
        </h1>
        <img
          src={asset.landingWordmarkHero}
          alt="기억온"
          width={263}
          height={41}
          className="absolute left-[118px]"
          style={{ top: Y(515), width: 263, height: 41 }}
        />
        <img
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
          src={asset.landingWordmarkCta}
          alt="기억온"
          width={205}
          height={33}
          className="absolute left-[483px]"
          style={{ top: Y(1390), width: 205, height: 33 }}
        />
        <p
          className="absolute left-[695px] w-[263px] text-[36px] font-bold leading-[70px] text-ink-900"
          style={{ top: Y(1371) }}
        >
          을 이용해보세요!
        </p>

        {/* 하단 회색 섹션 */}
        <div className="absolute inset-x-0 bg-[#f8f8f8]" style={{ top: Y(1539), height: 992 }} />
        <img
          src={asset.landingNotch}
          alt=""
          width={190}
          height={98}
          className="absolute left-[630px]"
          style={{ top: Y(1528), width: 190, height: 98 }}
        />
        <h2
          className="absolute left-[118px] w-[695px] text-[45px] font-bold leading-[70px] text-ink-900"
          style={{ top: Y(1652) }}
        >
          AI 회상 기록부터 요양일지,
          <br />
          보호자 공유까지, 하나의 인지 활동 관리
          <br />웹 서비스,
        </h2>
        <img
          src={asset.landingWordmarkSub}
          alt="기억온"
          width={264}
          height={42}
          className="absolute left-[314px]"
          style={{ top: Y(1807), width: 264, height: 42 }}
        />
        <img
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
              className="absolute h-[318px] w-[268px] rounded-[10px] bg-white shadow-card"
              style={{ left: f.left, top: Y(1941) }}
            />
            <p
              className="absolute text-center text-w-section font-semibold leading-[35px] text-ink-700"
              style={{ left: f.left + 10, top: Y(1990), width: 247 }}
            >
              {f.title}
            </p>
            <img
              src={f.icon}
              alt=""
              width={f.iconW}
              height={f.iconH}
              className="absolute"
              style={{
                left: f.left + 134 - f.iconW / 2,
                top: Y(2052),
                width: f.iconW,
                height: f.iconH,
              }}
            />
            <p
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
          className="absolute left-[380px] w-[679px] text-center text-[24px] font-semibold leading-[35px] text-ink-700"
          style={{ top: Y(2320) }}
        >
          AI 회상 기록 관리, 연대기 관리, AI 분석, 요양일지 관리,보호자 공유까지.
          <br />
          인지 활동 관리에 필요한 모든 기능을 하나의 웹에서 제공합니다.
        </p>
      </main>
    </div>
  );
}
