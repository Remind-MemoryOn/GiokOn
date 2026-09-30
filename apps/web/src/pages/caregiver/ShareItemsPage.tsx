import { Select } from '../../components/ui/Select';
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
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  parseSessionAnalysis,
  useProgramJournals,
  useCreateGuardianShare,
  useGuardianLinks,
  useProgramJournalPhotos,
  useProgramJournalPhotosByJournals,
  useCurrentUser,
  useGuardianShares,
  useProfile,
  useRevokeGuardianShare,
  useHasCapability,
  useSessionAnalyses,
  useSetShareNotifyOnView,
  type GuardianShareRow,
  type ProgramJournalPhotoRow,
  type ShareItemType,
} from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import { dateDot } from '@giokon/core';
import { asset } from '../../assets/ui';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ShareSettingsDialog, type ShareTarget } from '../../components/share-settings';
import { useJournalPhotoUrls } from '../../lib/journalPhotos';
import { useStore } from '../../store/store';
import { journalErrorMessage } from '../../lib/journalErrors';
import { cn } from '../../lib/utils';
import { Y } from '../../lib/figmaY';
import { useElderProfile } from '../../lib/elderProfile';

/**
 * 공개 행의 신원은 **(유형, 항목)** 이다. `session_summary` 와 `analysis` 는 같은
 * 분석 행 id 를 가리키므로 항목 id 만으로는 서로를 구분하지 못한다.
 */
const shareKey = (type: ShareItemType, id: string) => `${type}:${id}`;

/** 행의 요약 줄이 어떤 유형으로 공개되는가 — 일지는 그대로, AI 요약은 session_summary. */
const summaryTypeOf = (type: 'journal' | 'analysis'): ShareItemType =>
  type === 'journal' ? 'journal' : 'session_summary';

const CARD_TOP = 343;
const ROW_TOP = 394.24;
const ROW_H = 235.14;
const ROW_PITCH = 271.165;

/** 탭 — 라벨 x·밑줄 폭은 Figma 실측. */
const TABS = [
  { key: 'all', label: '전체', left: 426, w: 39, fx: '140:211' },
  { key: 'journal', label: '프로그램 일지', left: 589, w: 119, fx: '140:212' },
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
  // D5: 보호자에게 가는 것은 **확정된 일지의 보호자 문장**뿐이다(서버 공개 게이트) → 확정 일지만 목록에 둔다.
  const programJournals = useProgramJournals(elderId);
  const journals = useMemo(
    () => ({ ...programJournals, data: (programJournals.data ?? []).filter((j) => j.status === 'final') }),
    [programJournals],
  );
  const analyses = useSessionAnalyses(elderId);
  const shares = useGuardianShares(elderId);
  const me = useCurrentUser();
  const publish = useCreateGuardianShare();
  const revoke = useRevokeGuardianShare();
  const { isConfigured: capsReady } = useAuth();
  // 공개 철회는 권한 위임 표를 따른다(T25.4 — DB 가 강제). 권한이 없으면 버튼을 잠근다.
  const noRevoke = useHasCapability('share_revoke', { enabled: capsReady }).data === false;
  const setNotifyOnView = useSetShareNotifyOnView();
  // 공개 기록 설정 모달(146:422) — 항목 단위로 무엇을 공개할지 고른다.
  // `?settings=<항목 id>` 로 바로 열 수 있다(딥링크 · 정밀 대조).
  const [setting, setSetting] = useState<ShareTarget | null>(null);
  /** 비공개 전환 확인 대상 — 되돌릴 수 없어 확인을 받는다(네이티브 confirm 금지). */
  const [revoking, setRevoking] = useState<Item | null>(null);
  /** 목록 정렬 — 시안은 '최신순' 하나만 그렸지만 표시 전용이라 아무 일도 하지 않았다
   *  (2026-09-11 사용자 신고). 기록은 날짜가 전부라 최신/오래된 두 가지면 충분하다. */
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const guardians = useGuardianLinks(elderId);
  const guardianName = useMemo(() => {
    const approved = (guardians.data ?? []).find((g) => g.status === 'approved');
    return approved?.guardian?.name ?? null;
  }, [guardians.data]);


  const elder = useElderProfile(profileQuery.data);

  /**
   * (유형, 항목) → 철회되지 않은 공개 행. 없으면 미공개다.
   * ⚠️ **유형까지 넣어야 한다** — 요약(`session_summary`)과 AI 분석(`analysis`)은
   * 같은 분석 행 id 를 쓴다. item_id 만으로 키를 잡으면 하나가 다른 하나를 덮어
   * "AI 분석 체크 해제"가 요약 공개를 철회하는 일이 생긴다.
   */
  const activeShare = useMemo(() => {
    const map = new Map<string, GuardianShareRow>();
    for (const s of shares.data ?? []) {
      if (!s.revoked_at) map.set(shareKey(s.item_type, s.item_id), s);
    }
    return map;
  }, [shares.data]);

  // 행마다 "비공개 전환"이 그 일지의 사진 공개까지 함께 내려야 한다 → 일지↔사진 지도.
  const journalIds = useMemo(() => (journals.data ?? []).map((j) => j.id), [journals.data]);
  const allPhotos = useProgramJournalPhotosByJournals(journalIds);
  const photosByJournal = useMemo(() => {
    const map = new Map<string, ProgramJournalPhotoRow[]>();
    for (const ph of allPhotos.data ?? []) {
      const list = map.get(ph.journal_id) ?? [];
      list.push(ph);
      map.set(ph.journal_id, list);
    }
    return map;
  }, [allPhotos.data]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (tab === 'all' || tab === 'journal') {
      for (const j of journals.data ?? []) {
        const d = new Date(j.journal_date);
        const title = Number.isNaN(d.getTime())
          ? '프로그램 일지'
          : `${d.getMonth() + 1}월 ${d.getDate()}일 프로그램 일지`;
        out.push({
          key: `j-${j.id}`, type: 'journal', id: j.id,
          badge: { label: '프로그램 일지', w: 140 },
          // 보호자에게 보이는 글 = 승인된 보호자 문장. 아직 없으면 무엇이 비었는지 그대로 적는다.
          at: j.journal_date, title,
          body: j.guardian_text_approved_at && j.guardian_text ? j.guardian_text : '보호자 문장이 아직 승인되지 않았어요.',
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
    return out.sort((x, y) => {
      const d = new Date(x.at).getTime() - new Date(y.at).getTime();
      return order === 'desc' ? -d : d;
    });
  }, [tab, journals.data, analyses.data, order]);

  const settingsParam = search.get('settings');
  const open = setting ?? (settingsParam ? (items.find((i) => i.id === settingsParam) ?? null) : null);
  const openPhotos = useProgramJournalPhotos(open?.type === 'journal' ? open.id : undefined);
  const openPhotoUrls = useJournalPhotoUrls((openPhotos.data ?? []).map((p) => p.path), true);
  /** 모달의 처음 체크 상태 = 지금 공개돼 있는 것 그대로. */
  const openInitial = useMemo(() => {
    if (!open) return undefined;
    const first = activeShare.get(shareKey(summaryTypeOf(open.type), open.id));
    // 두 번째 줄: 일지=이 일지에 붙은 사진 · AI 요약=그 분석 자체.
    // ⚠️ 사진은 **이 일지의 사진**만 본다 — 예전에는 어떤 사진 하나만 공개돼 있어도
    //    모든 일지의 사진 체크가 켜져 보였다.
    const second = open.type === 'journal'
      ? (openPhotos.data ?? []).some((ph) => activeShare.has(shareKey('photo', ph.id)))
      : activeShare.has(shareKey('analysis', open.id));
    // 아직 아무것도 공개되지 않았으면 시안대로 둘 다 체크한 상태에서 시작한다.
    if (!first && !second) return undefined;
    return { summary: Boolean(first), second, notify: Boolean(first?.notify_on_view) };
  }, [open, activeShare, openPhotos.data]);

  const rowsEnd = ROW_TOP + Math.max(items.length, 1) * ROW_PITCH - (ROW_PITCH - ROW_H);
  const dividerTop = rowsEnd + 49.12;
  const cardBottom = dividerTop + 16.92 + 30.02 + 15.06;

  /**
   * 모달의 선택을 그대로 반영한다 — 체크된 것은 없으면 공개하고, 체크가 풀린 것은
   * 이미 공개돼 있으면 철회한다(같은 항목의 활성 공개는 서버가 1건으로 막는다).
   */
  async function onPublishPicked(
    picked: { type: ShareItemType; id: string; checked: boolean }[],
    notify: boolean,
  ) {
    if (!elderId || !me.data?.id) return;
    try {
      for (const p of picked) {
        const cur = activeShare.get(shareKey(p.type, p.id));
        if (p.checked && !cur) {
          await publish.mutateAsync({
            profile_id: elderId,
            item_type: p.type,
            item_id: p.id,
            shared_by: me.data.id,
            notify_on_view: notify,
          });
        } else if (p.checked && cur && cur.notify_on_view !== notify) {
          await setNotifyOnView.mutateAsync({ id: cur.id, notify });
        } else if (!p.checked && cur) {
          await revoke.mutateAsync({ id: cur.id, userId: me.data.id });
        }
      }
      setSetting(null);
      toast('success', '공개 설정을 저장했어요.');
    } catch (e) {
      toast('error', journalErrorMessage(e));
    }
  }
  /**
   * 이 행에 걸린 **모든** 공개 행(요약 + 두 번째 줄). 비공개 전환은 하나만 내리면
   * 안 된다 — 요약만 내리고 사진·AI 분석을 남기면 보호자 화면에 그대로 남는다.
   */
  function liveSharesOf(item: Item): GuardianShareRow[] {
    const keys = [shareKey(summaryTypeOf(item.type), item.id)];
    if (item.type === 'analysis') keys.push(shareKey('analysis', item.id));
    const out = keys
      .map((k) => activeShare.get(k))
      .filter((v): v is GuardianShareRow => Boolean(v));
    if (item.type === 'journal') {
      // 사진은 일지 id 가 아니라 사진 id 로 공개된다 → 이 일지 소속 사진만 고른다.
      const mine = new Set((photosByJournal.get(item.id) ?? []).map((ph) => ph.id));
      for (const s of shares.data ?? []) {
        if (!s.revoked_at && s.item_type === 'photo' && mine.has(s.item_id)) out.push(s);
      }
    }
    return out;
  }

  async function revokeAll(item: Item) {
    const rows = liveSharesOf(item);
    if (!rows.length || !me.data?.id) return;
    try {
      for (const row of rows) await revoke.mutateAsync({ id: row.id, userId: me.data.id });
      toast('success', '비공개로 전환했어요.');
    } catch (e) {
      toast('error', journalErrorMessage(e, '전환하지 못했어요.'));
    }
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

      {/* 정렬 — 시안 치수 그대로 두고 투명 select 를 덮는다(다른 화면의 기간 선택과 같은 방식) */}
      <div
        data-fx="140:611"
        className="absolute flex h-[30px] w-[108px] items-center rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03] focus-within:border-accent"
        style={{ left: 1268, top: Y(292) }}
      >
        {/* 타이포는 다른 화면의 기간 드롭다운과 같게 맞춘다 — 시안 값(20px 검정)을 쓰면
            혼자 크고 진해 보이고, "오래된순" 이 화살표(90)를 덮는다(2026-09-11 사용자 신고). */}
        <span className="pointer-events-none absolute left-[25px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[16px] leading-[23px] text-ink-500">
          {order === 'desc' ? '최신순' : '오래된순'}
        </span>
        <img
          src={asset.iconChevronDownSm}
          alt=""
          width={12}
          height={7.81}
          className="pointer-events-none absolute left-[90px] top-1/2 block -translate-y-1/2"
        />
        <Select
          aria-label="목록 정렬"
          value={order}
          onChange={(e) => setOrder(e.target.value as 'desc' | 'asc')}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          <option value="desc">최신순</option>
          <option value="asc">오래된순</option>
        </Select>
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
          const shared = liveSharesOf(item).length > 0;
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
                    onClick={() => setRevoking(item)}
                    disabled={noRevoke}
                    title={noRevoke ? '공개 철회 권한이 없어요(기관 권한 위임 표)' : undefined}
                    className="absolute h-[57px] w-[152px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent disabled:opacity-50"
                    style={{ left: 909, top: Y(top + 145.76) }}
                  >
                    비공개로 전환
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetting(item)}
                    data-fx={i === 0 ? '142:795' : undefined}
                    className="absolute flex h-[57px] w-[152px] items-center justify-center rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white"
                    style={{ left: 1074, top: Y(top + 145.76) }}
                  >
                    공개 기록 수정
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSetting(item)}
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

      {/* 공개 기록 설정 — 무엇을 공개할지 항목 단위로 고른다(146:422) */}
      <ConfirmDialog
        open={Boolean(revoking)}
        title="비공개로 전환할까요?"
        description={
          revoking
            ? `"${revoking.title}" 과(와) 여기에 함께 공개된 항목이 보호자 화면에서 즉시 사라집니다.`
            : ''
        }
        confirmLabel="비공개로 전환"
        onConfirm={() => {
          if (revoking) void revokeAll(revoking);
        }}
        onClose={() => setRevoking(null)}
      />

      <ShareSettingsDialog
        open={Boolean(open)}
        onClose={() => {
          setSetting(null);
          if (settingsParam) setSearch(tab === 'all' ? {} : { tab }, { replace: true });
        }}
        item={open}
        guardianName={guardianName}
        photos={openPhotos.data ?? []}
        photoUrls={openPhotoUrls.data}
        initial={openInitial}
        pending={publish.isPending}
        onPublish={(pick) => void onPublishPicked(pick.items, pick.notifyOnView)}
      />
    </div>
  );
}
