// 공개 관리 — 항목 목록 (Figma 140:121 전체 · 146:429 요양일지 · 146:824 AI 회상 대화 요약)
//   한 화면의 세 탭이다 — `?tab=journal|analysis` 로 고른다(기본 전체).
//   제목 @(322,186) · 부제 @(322,236.14) · 목록으로 @(1285,197.12) ·
//   탭 @301(전체 426 · 요양일지 589 · AI 회상 대화 요약 769 · 공개 이력 1012, 밑줄 @340) ·
//   정렬 pill 108×30 @(1268,292) · 카드 1054 @(322,343) ·
//   행 922×235.14 @388 (첫 행 394.24 · 피치 271.165)
//   행 내부: 유형 배지 @(49,+41.76) · 날짜 @(+19,+46.03) · 제목 Bold 25/70 @(68,+73.76) ·
//           본문 2줄 @(68,+138.08) · 상태 배지 100×35 @(774,+41.76) ·
//           버튼 152×57 @(521|686,+145.76) · 공개하기 140×57 @(698,+145.76) · ⋮ @(863,+161.76)
//
// ⚠️ Figma 는 1번째 행의 상태 배지만 3px 위로(433), 행마다 배지·버튼 y 를 0.2~1.5px 씩
//    흘려 놨다 → 1번째 행 기준으로 통일한다.
// ⚠️ 공개 여부는 `guardian_shares` 의 **철회되지 않은** 행으로 판정한다(행이 없으면 미공개).
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  parseSessionAnalysis,
  toElderProfile,
  useCareJournals,
  useCreateGuardianShare,
  useCurrentUser,
  useGuardianShares,
  useProfile,
  useRevokeGuardianShare,
  useSessionAnalyses,
  type ShareItemType,
} from '@giokon/data';
import { dateDot } from '@giokon/core';
import { asset } from '../../assets/ui';
import { Badge } from '../../components/ui/Badge';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;

const CARD_TOP = 343;
const ROW_TOP = 394.24;
const ROW_H = 235.14;
const ROW_PITCH = 271.165;

/** 탭 — 라벨 x·밑줄 폭은 Figma 실측. */
const TABS = [
  { key: 'all', label: '전체', left: 426, w: 39, fx: '140:211' },
  { key: 'journal', label: '요양일지', left: 589, w: 76, fx: '140:212' },
  { key: 'analysis', label: 'AI 회상 대화 요약', left: 769, w: 151, fx: '140:213' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** 목록 한 줄 — 일지·분석을 같은 모양으로 세운다. */
interface Item {
  key: string;
  type: Extract<ShareItemType, 'journal' | 'analysis'>;
  id: string;
  badge: { label: string; w: number };
  at: string;
  title: string;
  body: string;
}

export function ShareItemsPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const [search, setSearch] = useSearchParams();
  const toast = useStore((s) => s.toast);

  const tabParam = search.get('tab');
  const tab: Tab = tabParam === 'journal' || tabParam === 'analysis' ? tabParam : 'all';
  const setTab = (t: Tab) => setSearch(t === 'all' ? {} : { tab: t }, { replace: true });

  const profileQuery = useProfile(elderId);
  const journals = useCareJournals(elderId);
  const analyses = useSessionAnalyses(elderId);
  const shares = useGuardianShares(elderId);
  const me = useCurrentUser();
  const publish = useCreateGuardianShare();
  const revoke = useRevokeGuardianShare();

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );

  /** item_id → 철회되지 않은 공개 행. 없으면 미공개다. */
  const activeShare = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shares.data ?? []) {
      if (!s.revoked_at) map.set(s.item_id, s.id);
    }
    return map;
  }, [shares.data]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (tab === 'all' || tab === 'journal') {
      for (const j of journals.data ?? []) {
        const d = new Date(j.journal_date);
        const title = Number.isNaN(d.getTime())
          ? '요양일지'
          : `${d.getMonth() + 1}월 ${d.getDate()}일 요양일지`;
        out.push({
          key: `j-${j.id}`, type: 'journal', id: j.id,
          badge: { label: '요양일지', w: 107 },
          at: j.journal_date, title, body: j.content,
        });
      }
    }
    if (tab === 'all' || tab === 'analysis') {
      for (const row of analyses.data ?? []) {
        const a = parseSessionAnalysis(row);
        if (!a) continue; // 파싱 실패한 행은 버린다(값을 만들지 않는다)
        out.push({
          key: `a-${row.id}`, type: 'analysis', id: row.id,
          badge: { label: 'AI 회상 대화 요약', w: 175 },
          at: row.created_at,
          title: a.topicsEngaged[0] ? `${a.topicsEngaged[0]} 이야기` : 'AI 회상 대화 요약',
          body: a.summary,
        });
      }
    }
    return out.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [tab, journals.data, analyses.data]);

  const rowsEnd = ROW_TOP + Math.max(items.length, 1) * ROW_PITCH - (ROW_PITCH - ROW_H);
  const dividerTop = rowsEnd + 49.12;
  const cardBottom = dividerTop + 16.92 + 30.02 + 15.06;

  function onPublish(item: Item) {
    if (!elderId) return;
    publish.mutate(
      { profile_id: elderId, item_type: item.type, item_id: item.id, shared_by: me.data?.id ?? null },
      {
        onSuccess: () => toast('success', '보호자에게 공개했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }
  function onRevoke(item: Item) {
    const shareId = activeShare.get(item.id);
    if (!shareId || !me.data?.id) return;
    if (!window.confirm('보호자 화면에서 즉시 사라집니다. 비공개로 전환할까요?')) return;
    revoke.mutate(
      { id: shareId, userId: me.data.id },
      {
        onSuccess: () => toast('success', '비공개로 전환했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: cardBottom + 87 - 122 }}>
      <h1
        data-fx="140:207"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(186) }}
      >
        {elder ? `${elder.name} 어르신의 공개 관리` : '공개 관리'}
      </h1>
      <p
        data-fx="140:208"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.14) }}
      >
        오늘 공개할 일지·분석을 선택하세요. 공개된 항목만 보호자에게 보이며, 언제든 철회할 수 있어요.
      </p>
      <Link
        to="/caregiver/shares"
        data-fx="140:269"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(197.12) }}
      >
        <img src={asset.iconChevronRightSm} alt="" className="block rotate-180" style={{ width: 12.18, height: 18.73 }} />
        목록으로
      </Link>

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
      <Link
        to={`/caregiver/shares/${elderId ?? ''}/history`}
        data-fx="140:214"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 1012, top: Y(301) }}
      >
        공개 이력
      </Link>
      <div
        data-fx="140:258"
        className="absolute h-[3px] bg-accent"
        style={{ left: TABS.find((t) => t.key === tab)!.left, top: Y(340), width: TABS.find((t) => t.key === tab)!.w }}
      />

      {/* 정렬 — 시안은 '최신순' 하나뿐이라 정렬 기준도 최신순 고정임을 보여 준다 */}
      <div
        data-fx="140:611"
        className="absolute flex h-[30px] w-[108px] items-center rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
        style={{ left: 1268, top: Y(292) }}
      >
        <span className="absolute left-[25px] whitespace-nowrap text-w-body leading-[30px] text-ink-900">최신순</span>
        <img src={asset.iconChevronDownSm} alt="" width={12} height={7.81} className="absolute left-[90px] block" />
      </div>

      <div
        data-fx="140:558"
        className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardBottom - CARD_TOP }}
      />

      {items.length === 0 ? (
        <p
          className="absolute left-[388px] w-[922px] text-center text-w-body leading-[30px] text-ink-500"
          style={{ top: Y(ROW_TOP + 90) }}
        >
          공개할 수 있는 기록이 아직 없습니다.
        </p>
      ) : (
        items.map((item, i) => {
          const top = ROW_TOP + i * ROW_PITCH;
          const shared = activeShare.has(item.id);
          return (
            <div key={item.key}>
              <div
                data-fx={i === 0 ? '140:509' : undefined}
                className="absolute left-[388px] w-[922px] rounded-[10px] border border-line bg-white"
                style={{ top: Y(top), height: ROW_H }}
              />
              <Badge
                data-fx={i === 0 ? '140:493' : undefined}
                tone={item.type === 'journal' ? 'journal' : 'accent'}
                tag
                className="absolute"
                style={{ left: 437, top: Y(top + 41.76), width: item.badge.w }}
              >
                {item.badge.label}
              </Badge>
              <span
                data-fx={i === 0 ? '140:495' : undefined}
                className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-500"
                style={{ left: 437 + item.badge.w + 19, top: Y(top + 46.03) }}
              >
                {dateDot(item.at)}
              </span>
              <p
                data-fx={i === 0 ? '140:492' : undefined}
                className="absolute w-[430px] truncate text-w-section font-bold leading-[70px] text-ink-900"
                style={{ left: 456, top: Y(top + 73.76) }}
              >
                {item.title}
              </p>
              <p
                data-fx={i === 0 ? '140:496' : undefined}
                className="absolute line-clamp-2 w-[430px] text-w-body leading-[28px] text-ink-700"
                style={{ left: 456, top: Y(top + 138.08), wordBreak: 'keep-all' }}
              >
                {item.body}
              </p>
              <Badge
                data-fx={i === 0 ? '140:506' : undefined}
                tone={shared ? 'live' : 'mute'}
                tag
                className="absolute"
                style={{ left: 1162, top: Y(top + 41.76), width: 100 }}
              >
                {shared ? '공개됨' : '미공개'}
              </Badge>

              {shared ? (
                <>
                  <button
                    type="button"
                    data-fx={i === 0 ? '142:791' : undefined}
                    onClick={() => onRevoke(item)}
                    className="absolute h-[57px] w-[152px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
                    style={{ left: 909, top: Y(top + 145.76) }}
                  >
                    비공개로 전환
                  </button>
                  <Link
                    to={`/caregiver/shares/${elderId ?? ''}/set/${item.type}/${item.id}`}
                    data-fx={i === 0 ? '142:795' : undefined}
                    className="absolute flex h-[57px] w-[152px] items-center justify-center rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white"
                    style={{ left: 1074, top: Y(top + 145.76) }}
                  >
                    공개 기록 수정
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onPublish(item)}
                  className="absolute h-[57px] w-[140px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
                  style={{ left: 1086, top: Y(top + 145.76) }}
                >
                  공개하기
                </button>
              )}

              {/* ⋮ — 시안은 메뉴 내용을 그리지 않았다. 원본 기록으로 보내는 것만 한다. */}
              <Link
                to={
                  item.type === 'journal'
                    ? `/caregiver/journal/${elderId ?? ''}/${item.id}`
                    : `/caregiver/analysis/${elderId ?? ''}/sessions`
                }
                aria-label={`${item.title} 원본 보기`}
                className="absolute flex flex-col items-center justify-between"
                style={{ left: 1251, top: Y(top + 161.76), width: 5.54, height: 24 }}
              >
                <span className="block h-[5.54px] w-[5.54px] rounded-full bg-ink-700" />
                <span className="block h-[5.54px] w-[5.54px] rounded-full bg-ink-700" />
                <span className="block h-[5.54px] w-[5.54px] rounded-full bg-ink-700" />
              </Link>
            </div>
          );
        })
      )}

      <div
        data-fx="140:580"
        className="absolute left-[388px] h-px w-[922px] bg-line"
        style={{ top: Y(dividerTop) }}
      />
      {/* 더보기 — 목록이 길어지면 늘려 받는 자리. 지금은 전량을 받아 그린다. */}
      <div
        data-fx="140:571"
        className="absolute flex items-center gap-[14px] text-w-body leading-[30px] text-ink-700"
        style={{ left: 807, top: Y(dividerTop + 16.92) }}
      >
        더보기
        <img src={asset.iconChevronDownSm} alt="" style={{ width: 18.73, height: 12.18 }} className="block" />
      </div>
    </div>
  );
}
