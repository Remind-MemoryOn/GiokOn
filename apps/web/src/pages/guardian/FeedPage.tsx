// 보호자 — 공개된 소식 (Figma 50:543 / 55:1488 / 55:1920 / 55:2035 — 탭 4개가 한 라우트)
//   제목 @(322,186) · 부제 @(322,236.14) · 어르신 pill 322×57 @(1054,187)
//   탭 @301(전체 426/39 · 요양일지 589/77 · AI 회상 대화 요약 769/151 · 공유 사진 1012/82, 밑줄 @340)
//   날짜 선택 170×37 @(1203,294.17) · 카드 1054 @(322,343)
//
// ── 목록 탭(전체·요양일지·AI 요약) ──────────────────────────────────────────
//   항목(피치 236): 배지 @(388,+0) · 날짜 @(배지오른쪽+19,+4.23) · 제목 Bold 25/70 @(407,+32) ·
//                   본문 2줄 @(407,+96.28) · 자세히 보기 @(1125,+67.27) · 구분선 922 @(388,+191)
//   카드 높이는 항목 수에서 나온다 — 더보기가 붙으면 마지막 구분선까지 그리고 +61,
//   아니면 마지막 항목 시작 +210. (시안: 4건+더보기=1004 · 3건=726)
//   담당 요양보호사 카드 1054×211 은 **전체 탭에만** 있다(@322,1414 = 카드 끝 +67).
//
// ── 공유 사진 탭(55:2035) ───────────────────────────────────────────────────
//   카드 안 제목 @(407,371) · 설명 @(407,435.26) · 사진 카드 394×486 2열
//   @x 407/890 · y 491 피치 536 · 사진 246 · 배지 113×35 @+44,+273 · 날짜 @+169,+277.46 ·
//   제목 @+63,+305 · 본문 @+63,+369.52
//
// ⚠️ Figma 는 3번째 항목만 x 를 9 크게(397/416), 자세히 보기 y 를 항목마다 5px 안팎으로
//    흘려 놨다 → 388/407 · +67.27 로 통일한다.
// ⚠️ 자세히 보기 옆 화살표는 반전 노드라 metadata x(1287.99)가 렌더 위치가 아니다 —
//    프레임 오른끝 − 폭 = 1275.8 이 실제 위치(잉크 실측 1276.0~1288.0 확인).
// ⚠️ 공개 항목 유형 매핑: journal=요양일지 · analysis=AI 회상 대화 요약 · photo=공유 사진 ·
//    report=관찰 포인트. 원본이 없는 공개는 그리지 않는다(없는 소식을 만들지 않는다).
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  parseSessionAnalysis,
  toElderProfile,
  useMySharedContent,
  useProfile,
  type ShareItemType,
} from '@giokon/data';
import { dateDot, dateDotTime } from '@giokon/core';
import { asset } from '../../assets/ui';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { useAuth } from '../../auth/AuthProvider';
import { useGuardianElder } from '../../lib/guardianElder';
import { ElderPill, GuardianGreeting } from '../../components/guardian-header';
import { MessageNoticeDialog } from '../../components/guardian-message';
import { useJournalPhotoUrls } from '../../lib/journalPhotos';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;

const CARD_TOP = 343;
const ITEM_TOP = 387;
const ITEM_PITCH = 236;
/** 한 번에 보여 주는 소식 수 — 시안(전체 탭)이 4건 + 더보기다. */
const PAGE = 4;

/** 사진 카드 격자(55:2035) — 카드 기준 상대 좌표. */
const G = {
  top: 491,
  cols: [407, 890],
  w: 394,
  h: 486,
  rowPitch: 536,
  photoH: 246,
};

const TABS = [
  { key: 'all', label: '전체', left: 426, w: 39, fx: '50:825',
    subtitle: '오늘도 어르신의 소중한 하루를 확인해보세요.' },
  { key: 'journal', label: '요양일지', left: 589, w: 77, fx: '50:826',
    subtitle: '오늘도 어르신의 요양일지를 확인해보세요.' },
  { key: 'analysis', label: 'AI 회상 대화 요약', left: 769, w: 151, fx: '50:827',
    subtitle: '오늘도 어르신의 AI 회상 대화 요약을 확인해보세요.' },
  { key: 'photo', label: '공유 사진', left: 1012, w: 82, fx: '50:828',
    subtitle: '오늘도 어르신의 활동 사진을 확인해보세요.' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** 공개 항목 유형 → 배지(라벨·폭·톤). 디자인 실측. */
const KIND: Partial<Record<ShareItemType, { label: string; w: number; tone: BadgeTone }>> = {
  journal: { label: '요양일지', w: 107, tone: 'journal' },
  analysis: { label: 'AI 회상 대화 요약', w: 175, tone: 'accent' },
  photo: { label: '공유 사진', w: 113, tone: 'chronicle' },
  report: { label: '관찰 포인트', w: 128, tone: 'info' },
};

type FeedItem = {
  key: string;
  kind: ShareItemType;
  /** 공개된 시각 — 목록의 `2026.07.30   19:00`. */
  at: string;
  /** 내용 자체의 날짜(일지 기록일·분석 생성일·사진이 붙은 일지의 날짜) — 제목과 사진 격자용. */
  on: string;
  title: string;
  body: string;
  photoPath?: string;
  to: string;
};

export function FeedPage() {
  const { isConfigured, userRow } = useAuth();
  const [search, setSearch] = useSearchParams();
  const tabParam = search.get('tab');
  const tabDef = TABS.find((t) => t.key === tabParam) ?? TABS[0];
  const tab: Tab = tabDef.key;
  const [limit, setLimit] = useState(PAGE);
  const compose = search.get('compose') === '1';
  const setTab = (t: Tab) => {
    setLimit(PAGE);
    setSearch(t === 'all' ? {} : { tab: t }, { replace: true });
  };

  const { link: approvedLink } = useGuardianElder();
  const shared = useMySharedContent({ enabled: isConfigured });
  const profileQuery = useProfile(approvedLink?.profile_id);
  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );

  const photoPaths = useMemo(() => (shared.data?.photos ?? []).map((p) => p.path), [shared.data]);
  const photoUrls = useJournalPhotoUrls(photoPaths, isConfigured);

  /** 공개된 항목을 한 줄로 편다 — 원본이 없으면 그리지 않는다. */
  const items = useMemo<FeedItem[]>(() => {
    const journals = new Map((shared.data?.journals ?? []).map((j) => [j.id, j]));
    const analyses = new Map((shared.data?.analyses ?? []).map((a) => [a.id, a]));
    const photos = new Map((shared.data?.photos ?? []).map((p) => [p.id, p]));
    const out: FeedItem[] = [];
    for (const s of shared.data?.shares ?? []) {
      if (s.revoked_at) continue;
      if (s.item_type === 'journal') {
        const j = journals.get(s.item_id);
        if (!j) continue;
        const d = new Date(j.journal_date);
        out.push({
          key: s.id, kind: 'journal', at: s.shared_at, on: j.journal_date,
          title: Number.isNaN(d.getTime()) ? '요양일지' : `${d.getMonth() + 1}월 ${d.getDate()}일 요양일지`,
          body: j.content, to: `/guardian/feed/journal/${j.id}`,
        });
      } else if (s.item_type === 'analysis') {
        const row = analyses.get(s.item_id);
        if (!row) continue;
        const a = parseSessionAnalysis(row);
        if (!a) continue;
        out.push({
          key: s.id, kind: 'analysis', at: s.shared_at, on: row.created_at,
          title: a.topicsEngaged[0] ? `${a.topicsEngaged[0]} 이야기` : 'AI 회상 대화 요약',
          body: a.summary, to: `/guardian/feed/summary/${s.item_id}`,
        });
      } else if (s.item_type === 'photo') {
        const p = photos.get(s.item_id);
        if (!p) continue;
        // 사진의 날짜는 붙어 있는 일지의 날짜다. 일지가 공개돼 있지 않으면 알 수 없어
        // 파일이 올라온 시각으로 되돌린다(추정 날짜를 만들지 않는다).
        const j = journals.get(p.journal_id);
        const on = j ? j.journal_date : p.created_at;
        const d = new Date(on);
        out.push({
          key: s.id, kind: 'photo', at: s.shared_at, on,
          title: Number.isNaN(d.getTime()) ? '활동 사진' : `${d.getMonth() + 1}월 ${d.getDate()}일 활동 사진`,
          body: p.caption ?? '',
          photoPath: p.path, to: '/guardian/feed?tab=photo',
        });
      }
    }
    return out.filter((i) => tab === 'all' || i.kind === tab);
  }, [shared.data, tab]);

  const shown = items.slice(0, limit);
  const hasMore = items.length > shown.length;

  // 시안(4건+더보기): 마지막 구분선 1286 → 카드 끝 1347 · 더보기 1302.76 · 담당 카드 1414.
  // 더보기가 없으면 마지막 항목 아래 구분선도 없다(시안 3건: 859 + 210 = 1069).
  const lastTop = ITEM_TOP + (Math.max(shown.length, 1) - 1) * ITEM_PITCH;
  const listBottom = hasMore ? lastTop + 191 + 61 : lastTop + 210;
  const rows = Math.max(Math.ceil(shown.length / G.cols.length), 1);
  const gridBottom = G.top + rows * G.h + (rows - 1) * (G.rowPitch - G.h) + 66;
  const cardBottom = tab === 'photo' ? gridBottom : listBottom;
  const careCardTop = cardBottom + 67;
  const pageBottom = tab === 'all' ? careCardTop + 211 : cardBottom;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: Y(pageBottom) + 88 }}>
      <GuardianGreeting
        name={userRow?.name}
        subtitle={tabDef.subtitle}
        fxTitle="50:544"
        fxDesc="50:546"
      />
      <ElderPill
        elderName={elder?.name}
        to="/guardian"
        fxBox="50:844"
        fxLabel="50:845"
        fxName="50:847"
      />

      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          data-fx={t.fx}
          onClick={() => setTab(t.key)}
          aria-pressed={tab === t.key}
          className={cn(
            'absolute whitespace-nowrap text-w-nav leading-[30px]',
            tab === t.key ? 'font-semibold text-accent' : 'text-ink-500',
          )}
          style={{ left: t.left, top: Y(301) }}
        >
          {t.label}
        </button>
      ))}
      <div
        data-fx="50:908"
        className="absolute h-[3px] bg-accent"
        style={{ left: tabDef.left, top: Y(340), width: tabDef.w }}
      />

      {/* 날짜 선택 — 여는 화면이 디자인에 없어 지금은 표시만 한다(전체 기간) */}
      <div
        data-fx="157:130"
        className="absolute left-[1203px] h-[37.02px] w-[170px] rounded-[5px] border border-line bg-white"
        style={{ top: Y(294.17) }}
      >
        <img src={asset.iconCalendarSm} alt="" width={22} height={22} className="pointer-events-none absolute left-[13px] top-1/2 block -translate-y-1/2" />
        <span data-fx="157:131" className="pointer-events-none absolute left-[47px] top-[4px] whitespace-nowrap text-[16px] leading-[30px] text-ink-500">
          날짜 선택하기
        </span>
        <img src={asset.iconChevronDownSm} alt="" width={12} height={7.81} className="pointer-events-none absolute left-[156px] top-1/2 block -translate-y-1/2" />
      </div>

      <div
        data-fx="50:933"
        className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardBottom - CARD_TOP }}
      />

      {items.length === 0 ? (
        <p
          className="absolute left-[388px] w-[922px] text-center text-w-body leading-[30px] text-ink-500"
          style={{ top: Y(ITEM_TOP + 70) }}
        >
          아직 공개된 소식이 없어요. 요양보호사가 공개하면 여기에 보여요.
        </p>
      ) : tab === 'photo' ? (
        <PhotoGrid items={shown} urls={photoUrls.data} />
      ) : (
        shown.map((item, i) => {
          const top = ITEM_TOP + i * ITEM_PITCH;
          const kind = KIND[item.kind]!;
          const last = i === shown.length - 1;
          return (
            <div key={item.key}>
              <Badge
                data-fx={i === 0 ? '50:939' : undefined}
                tone={kind.tone}
                tag
                className="absolute"
                style={{ left: 388, top: Y(top), width: kind.w }}
              >
                {kind.label}
              </Badge>
              <span
                data-fx={i === 0 ? '50:942' : undefined}
                className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-500"
                style={{ left: 388 + kind.w + 19, top: Y(top + 4.23) }}
              >
                {dateDotTime(item.at)}
              </span>
              <p
                data-fx={i === 0 ? '50:934' : undefined}
                className="absolute w-[600px] truncate text-w-section font-bold leading-[70px] text-ink-900"
                style={{ left: 407, top: Y(top + 32) }}
              >
                {item.title}
              </p>
              <p
                data-fx={i === 0 ? '50:944' : undefined}
                className="absolute line-clamp-2 w-[600px] text-w-body leading-[28px] text-ink-700"
                style={{ left: 407, top: Y(top + 96.28), wordBreak: 'keep-all' }}
              >
                {item.body}
              </p>
              {item.photoPath ? (
                <img
                  data-fx={i === 0 ? '50:988' : undefined}
                  src={photoUrls.data?.[item.photoPath]}
                  alt={item.title}
                  className="absolute block rounded-[10px] object-cover"
                  style={{ left: 1108, top: Y(top + 3), width: 185, height: 116 }}
                />
              ) : null}
              <Link
                to={item.to}
                data-fx={i === 0 ? '50:964' : undefined}
                /* 줄상자 21→25.5: Figma 는 21.02 줄높이 안에서 잉크를 CSS 보다 2.25px
                   아래에 앉힌다 → 상자를 4.5 넓혀 위 모서리는 그대로 두고 잉크만 내린다. */
                className="absolute block w-[136px] text-right text-w-body font-semibold leading-[25.5px] text-ink-700"
                style={{ left: 1125, top: Y(top + 67.27) }}
              >
                {item.kind === 'report' ? 'AI 분석 보기' : '자세히 보기'}
                <img
                  data-fx={i === 0 ? '50:966' : undefined}
                  src={asset.iconChevronRightSm}
                  alt=""
                  className="absolute block"
                  style={{ left: 150.8, top: 19.62, width: 12.18, height: 18.73 }}
                />
              </Link>
              {last && !hasMore ? null : (
                <div
                  data-fx={i === 0 ? '140:314' : undefined}
                  className="absolute left-[388px] h-px w-[922px] bg-line"
                  style={{ top: Y(top + 191) }}
                />
              )}
            </div>
          );
        })
      )}

      {hasMore ? (
        <button
          type="button"
          data-fx="50:1057"
          onClick={() => setLimit((n) => n + PAGE)}
          className="absolute flex items-center gap-[14px] text-w-body leading-[30px] text-ink-700"
          style={{ left: 799, top: Y(lastTop + 191 + 16.76) }}
        >
          더보기
          <img src={asset.iconChevronDownSm} alt="" style={{ width: 18.73, height: 12.18 }} className="block" />
        </button>
      ) : null}

      {/* ── 담당 요양보호사 — 전체 탭에만 있다 ─────────────────────────── */}
      {tab === 'all' ? (
        <div
          data-fx="55:1323"
          className="absolute left-[322px] h-[211px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: Y(careCardTop) }}
        >
          <span
            data-fx="50:1204"
            className="absolute left-[66px] top-[37.85px] whitespace-nowrap text-[25px] font-semibold leading-[30px] text-ink-900"
          >
            담당 요양보호사
          </span>
          <Avatar name="" px={79} className="absolute" style={{ left: 66, top: 86 }} />
          <span
            data-fx="50:1203"
            className="absolute left-[166px] top-[96.88px] whitespace-nowrap text-[22px] leading-[26px] text-ink-900"
          >
            {/* 담당 요양보호사의 이름·소속 기관은 보호자 권한으로 읽을 경로가 아직 없다
                (users·organizations 는 RLS 로 막혀 있다) → 이름을 지어내지 않고 빈 값으로 둔다. */}
            —
          </span>
          <span
            data-fx="50:1210"
            className="absolute left-[166px] top-[131.9px] whitespace-nowrap text-[18px] leading-[21px] text-ink-500"
          >
            —
          </span>
          {/* 메시지는 보호자 → 요양보호사 단방향이다(디자인 확정) */}
          <Link
            to="/guardian/feed?compose=1"
            data-fx="50:1202"
            className="absolute flex h-[50.03px] w-[213px] items-center rounded-[10px] border border-line bg-white"
            style={{ left: 767, top: 94.88 }}
          >
            <span className="absolute left-[27px] flex gap-[3px]">
              <span className="block h-[3px] w-[3px] rounded-full bg-ink-500" />
              <span className="block h-[3px] w-[3px] rounded-full bg-ink-500" />
              <span className="block h-[3px] w-[3px] rounded-full bg-ink-500" />
            </span>
            <span
              data-fx="50:1205"
              className="absolute left-[73px] whitespace-nowrap text-w-body leading-[30px] text-ink-900"
            >
              메시지 보내기
            </span>
          </Link>
        </div>
      ) : null}

      {/* 메시지 이용 안내 — 보내기 전에 반드시 읽는다(69:195) */}
      <MessageNoticeDialog
        open={compose}
        profileId={approvedLink?.profile_id}
        senderUserId={userRow?.id}
        onClose={() => setSearch(tab === 'all' ? {} : { tab }, { replace: true })}
      />
    </div>
  );
}

/** 공유 사진 탭(55:2035) — 같은 카드 안에 2열 사진 카드를 깐다. */
function PhotoGrid({ items, urls }: { items: FeedItem[]; urls?: Record<string, string> }) {
  return (
    <>
      <p
        data-fx="55:2213"
        className="absolute left-[407px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        style={{ top: Y(371) }}
      >
        공유 사진
      </p>
      <p
        data-fx="55:2214"
        className="absolute left-[407px] whitespace-nowrap text-[18px] leading-[28px] text-ink-700"
        style={{ top: Y(435.26) }}
      >
        어르신의 활동 사진을 날짜순으로 확인하실 수 있습니다.
      </p>
      {items.map((item, i) => {
        const left = G.cols[i % G.cols.length];
        const top = G.top + Math.floor(i / G.cols.length) * G.rowPitch;
        return (
          <div
            key={item.key}
            data-fx={i === 0 ? '55:2223' : undefined}
            className="absolute overflow-hidden rounded-[10px] border border-line bg-white"
            style={{ left, top: Y(top), width: G.w, height: G.h }}
          >
            {item.photoPath && urls?.[item.photoPath] ? (
              <img
                data-fx={i === 0 ? '55:2225' : undefined}
                src={urls[item.photoPath]}
                alt={item.title}
                className="absolute left-0 top-0 block object-cover"
                style={{ width: G.w, height: G.photoH }}
              />
            ) : (
              <div
                data-fx={i === 0 ? '55:2225' : undefined}
                className="absolute left-0 top-0 bg-cream-100"
                style={{ width: G.w, height: G.photoH }}
              />
            )}
            <Badge
              data-fx={i === 0 ? '55:2227' : undefined}
              tone="chronicle"
              tag
              className="absolute"
              style={{ left: 44, top: 273, width: 113 }}
            >
              공유 사진
            </Badge>
            <span
              data-fx={i === 0 ? '55:2229' : undefined}
              className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-500"
              style={{ left: 169, top: 277.46 }}
            >
              {dateDot(item.on)}
            </span>
            <p
              data-fx={i === 0 ? '55:2226' : undefined}
              className="absolute w-[300px] truncate text-w-section font-bold leading-[70px] text-ink-900"
              style={{ left: 63, top: 305 }}
            >
              {item.title}
            </p>
            <p
              data-fx={i === 0 ? '55:2230' : undefined}
              className="absolute line-clamp-3 w-[300px] text-w-body leading-[28px] text-ink-700"
              style={{ left: 63, top: 369.52, wordBreak: 'keep-all' }}
            >
              {item.body}
            </p>
          </div>
        );
      })}
    </>
  );
}
