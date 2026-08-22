// 공개 관리 — 공개 이력 (Figma 146:1067 — 1440×1669)
//   제목 @(322,186) · 부제 @(322,236.14) · 목록으로 @(1285,197.12) ·
//   탭 @301(활성=공개 이력, 밑줄 81×3 @1012,340) · 필터 pill 95×30 @(1281,292)
//   ⚠️ 이 프레임만 카드 x 가 **329** 다(다른 공개 관리 화면은 322) — 시안 그대로 둔다.
//   카드 1054 @(329,345) · 머리글 @+26.22 · 첫 구분선 @426 · 행 높이 132~140(내용에 따라)
//   열: 유형 354(가운데 422.5) · 제목 554 · 공개일시 692 · 공개상태 856 ·
//       보호자 확인 1019(왼쪽 맞춤) · 작업 1200(117×39 두 줄, 간격 11)
//
// ⚠️ 행 높이는 제목이 두 줄이면 늘어난다 → 셀은 세로 가운데 정렬로 두고 행 높이를
//    내용에서 계산한다(시안의 132/136/137/139/140 은 그 결과다).
// ⚠️ 보호자 확인 시각은 아직 DB 에 없다(`guardian_shares.viewed_at` 미도입) → `—` 로 둔다.
//    없는 확인 기록을 만들지 않는다.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  parseSessionAnalysis,
  toElderProfile,
  useCareJournals,
  useCurrentUser,
  useGuardianShares,
  useProfile,
  useRevokeGuardianShare,
  useSessionAnalyses,
} from '@giokon/data';
import { asset } from '../../assets/ui';
import { Badge } from '../../components/ui/Badge';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;

const CARD_LEFT = 329;
const CARD_TOP = 345;
/** 머리글 아래 첫 구분선까지(345 → 426). */
const HEAD_H = 81;
/** 제목이 한 줄일 때의 행 높이(시안 132~140 의 기준값). */
const ROW_H = 136;

/** 열 x(화면 절대). 보호자 확인만 왼쪽 맞춤이고 나머지는 가운데다. */
const COLS = {
  typeCenter: 422.5,
  titleCenter: 591,
  atCenter: 742.5,
  stateCenter: 906,
  viewedLeft: 1019,
  actionLeft: 1200,
};

/** `2026.07.30 11:02` — 값이 없으면 만들지 않는다. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${d.getHours()}:${p(d.getMinutes())}`;
}

export function ShareHistoryPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const toast = useStore((s) => s.toast);

  const profileQuery = useProfile(elderId);
  const shares = useGuardianShares(elderId);
  const journals = useCareJournals(elderId);
  const analyses = useSessionAnalyses(elderId);
  const me = useCurrentUser();
  const revoke = useRevokeGuardianShare();

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );

  /** item_id → 제목. 원본이 지워졌으면 키가 없다(제목을 만들지 않는다). */
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of journals.data ?? []) {
      const d = new Date(j.journal_date);
      map.set(
        j.id,
        Number.isNaN(d.getTime()) ? '요양일지' : `${d.getMonth() + 1}월 ${d.getDate()}일 요양일지`,
      );
    }
    for (const row of analyses.data ?? []) {
      const a = parseSessionAnalysis(row);
      map.set(row.id, a?.topicsEngaged[0] ? `${a.topicsEngaged[0]} 이야기` : 'AI 회상 대화 요약');
    }
    return map;
  }, [journals.data, analyses.data]);

  const rows = shares.data ?? [];
  const cardHeight = HEAD_H + Math.max(rows.length, 1) * ROW_H + 1;

  function onRevoke(id: string) {
    if (!me.data?.id) return;
    if (!window.confirm('보호자 화면에서 즉시 사라집니다. 공개를 취소할까요?')) return;
    revoke.mutate(
      { id, userId: me.data.id },
      {
        onSuccess: () => toast('success', '공개를 취소했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: Y(CARD_TOP) + cardHeight + 147 }}>
      <h1
        data-fx="146:1142"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(186) }}
      >
        {elder ? `${elder.name} 어르신의 공개 이력` : '공개 이력'}
      </h1>
      <p
        data-fx="146:1143"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.14) }}
      >
        공개한 기록의 이력과 보호자의 확인 여부를 관리합니다.
      </p>
      <Link
        to="/caregiver/shares"
        data-fx="146:1151"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(197.12) }}
      >
        <img src={asset.iconChevronRightSm} alt="" className="block rotate-180" style={{ width: 12.18, height: 18.73 }} />
        목록으로
      </Link>

      {/* 탭 — 앞 세 개는 항목 목록으로 돌아간다 */}
      {[
        { label: '전체', left: 426, to: '', fx: '146:1144' },
        { label: '요양일지', left: 589, to: '?tab=journal', fx: '146:1145' },
        { label: 'AI 회상 대화 요약', left: 769, to: '?tab=analysis', fx: '146:1146' },
      ].map((t) => (
        <Link
          key={t.label}
          to={`/caregiver/shares/${elderId ?? ''}${t.to}`}
          data-fx={t.fx}
          className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
          style={{ left: t.left, top: Y(301) }}
        >
          {t.label}
        </Link>
      ))}
      <span
        data-fx="146:1147"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 1012, top: Y(301) }}
      >
        공개 이력
      </span>
      <div data-fx="146:1148" className="absolute h-[3px] w-[81px] bg-accent" style={{ left: 1012, top: Y(340) }} />

      <div
        data-fx="146:1155"
        className="absolute flex h-[30px] w-[95px] items-center rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
        style={{ left: 1281, top: Y(292) }}
      >
        <span className="absolute left-[22px] whitespace-nowrap text-w-body leading-[30px] text-ink-900">전체</span>
        <img src={asset.iconChevronDownSm} alt="" width={12} height={7.81} className="absolute left-[77px] block" />
      </div>

      <div
        data-fx="146:1068"
        className="absolute w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ left: CARD_LEFT, top: Y(CARD_TOP), height: cardHeight }}
      />

      {/* 머리글 */}
      {[
        { label: '유형', center: COLS.typeCenter, fx: '146:1278' },
        { label: '제목', center: COLS.titleCenter, fx: '146:1280' },
        { label: '공개일시', center: COLS.atCenter, fx: '146:1282' },
        { label: '공개상태', center: COLS.stateCenter, fx: '146:1284' },
        { label: '작업', center: COLS.actionLeft + 58.5, fx: '146:1288' },
      ].map((h) => (
        <span
          key={h.label}
          data-fx={h.fx}
          className="absolute -translate-x-1/2 whitespace-nowrap text-w-body font-semibold leading-[28px] text-ink-900"
          style={{ left: h.center, top: Y(371.22) }}
        >
          {h.label}
        </span>
      ))}
      <span
        data-fx="146:1286"
        className="absolute whitespace-nowrap text-w-body font-semibold leading-[28px] text-ink-900"
        style={{ left: COLS.viewedLeft, top: Y(371.22) }}
      >
        보호자 확인
      </span>
      <div
        data-fx="146:1361"
        className="absolute h-px w-[1054px] bg-line"
        style={{ left: CARD_LEFT, top: Y(CARD_TOP + HEAD_H) }}
      />

      {rows.length === 0 ? (
        <p
          className="absolute w-[1054px] text-center text-w-body leading-[30px] text-ink-500"
          style={{ left: CARD_LEFT, top: Y(CARD_TOP + HEAD_H + 50) }}
        >
          아직 공개한 기록이 없습니다.
        </p>
      ) : (
        rows.map((s, i) => {
          const top = CARD_TOP + HEAD_H + i * ROW_H;
          const mid = top + ROW_H / 2;
          const isJournal = s.item_type === 'journal';
          const live = !s.revoked_at;
          return (
            <div key={s.id}>
              <Badge
                data-fx={i === 0 ? '146:1293' : undefined}
                tone={isJournal ? 'journal' : 'accent'}
                tag
                className={cn('absolute -translate-x-1/2 -translate-y-1/2', isJournal ? 'w-[107px]' : 'w-[137px]')}
                style={{ left: COLS.typeCenter, top: Y(mid) }}
              >
                {isJournal ? '요양일지' : 'AI 회상 대화'}
              </Badge>
              <span
                data-fx={i === 0 ? '146:1296' : undefined}
                className="absolute w-[110px] -translate-x-1/2 -translate-y-1/2 text-center text-w-body leading-[28px] text-ink-900"
                style={{ left: COLS.titleCenter, top: Y(mid), wordBreak: 'keep-all' }}
              >
                {/* 원본이 없으면 제목을 만들지 않는다 */}
                {titles.get(s.item_id) ?? '—'}
              </span>
              <span
                data-fx={i === 0 ? '146:1300' : undefined}
                className="absolute w-[110px] -translate-x-1/2 -translate-y-1/2 whitespace-pre-line text-center text-w-body leading-[28px] text-ink-900"
                style={{ left: COLS.atCenter, top: Y(mid) }}
              >
                {stamp(s.shared_at).replace(' ', '\n')}
              </span>
              <Badge
                data-fx={i === 0 ? '146:1303' : undefined}
                tone={live ? 'live' : 'mute'}
                tag
                className="absolute w-[100px] -translate-x-1/2 -translate-y-1/2"
                style={{ left: COLS.stateCenter, top: Y(mid) }}
              >
                {live ? '공개중' : '미공개'}
              </Badge>
              <span
                data-fx={i === 0 ? '146:1307' : undefined}
                className="absolute w-[130px] -translate-y-1/2 text-w-body leading-[28px] text-ink-900"
                style={{ left: COLS.viewedLeft, top: Y(mid) }}
              >
                {/* 보호자 확인 시각은 아직 기록하지 않는다 → 만들지 않는다 */}
                -
              </span>
              <Link
                to={
                  isJournal
                    ? `/caregiver/journal/${elderId ?? ''}/${s.item_id}`
                    : `/caregiver/analysis/${elderId ?? ''}/sessions`
                }
                data-fx={i === 0 ? '146:1314' : undefined}
                className="absolute flex h-[39px] w-[117px] items-center justify-center rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white"
                style={{ left: COLS.actionLeft, top: Y(mid - 25.5) }}
              >
                상세 보기
              </Link>
              {live ? (
                <button
                  type="button"
                  data-fx={i === 0 ? '146:1310' : undefined}
                  onClick={() => onRevoke(s.id)}
                  className="absolute h-[39px] w-[117px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
                  style={{ left: COLS.actionLeft, top: Y(mid + 24.5) }}
                >
                  공개 취소
                </button>
              ) : null}
              <div
                className="absolute h-px w-[1054px] bg-line"
                style={{ left: CARD_LEFT, top: Y(top + ROW_H) }}
              />
            </div>
          );
        })
      )}

      {/* 더보기 — 목록이 길어지면 늘려 받는 자리. 지금은 전량을 받아 그린다. */}
      <div
        data-fx="146:1137"
        className="absolute flex items-center gap-[14px] text-w-body leading-[30px] text-ink-700"
        style={{ left: 807, top: Y(CARD_TOP + cardHeight + 16.92) }}
      >
        더보기
        <img src={asset.iconChevronDownSm} alt="" style={{ width: 18.73, height: 12.18 }} className="block" />
      </div>
    </div>
  );
}
