// 프로그램 일지 목록 (파일럿 W1 · SCR-W15 — 틀은 요양일지 목록 Figma 207:1147 — 1440×1579)
//   목록으로 @(322,194.12) · 제목 @(322,243) · 부제 2줄 w519 @(322,293.19) ·
//   "새 프로그램 일지" 185×57 r10 accent @(1194,188) · 날짜 선택 170×37 @(1209,316.2)
//   카드 1057×1116 @(322,376) · 행 879×235.15 @410 (첫 행 427.27 · 피치 259.164)
//   행 내부: 배지 107×35 @+41.73 · 배지 글자 SemiBold 20 @+48.03 · 날짜 @(175,+46.03) ·
//           제목 Bold 25/70 @(68,+73.73) · 본문 Regular 20/28 @(68,+138.09) ·
//           연필 28 @(710,+103.73) · 휴지통 27 @(769,+104.07)
//
// ⚠️ Figma 는 행 사각형을 소수 y(427.27·686.43…)에, 안쪽 요소는 정수 그리드(469·728…)에
//    올려놔 행마다 0.2~0.5px 씩 어긋난다 → 행 기준 상대좌표로 통일한다.
// ⚠️ 파일럿 W1(2026-09-26): 시안의 '요양일지' 분류 배지 자리에 **상태 칩**(생성 중·확인 대기·확정·생성 실패)을 둔다.
//    "확인 대기 N건"은 날짜 선택 왼쪽(같은 줄 = 목록 최상단)에 두고, 누르면 확인 대기만 거른다.
//    생성 실패 행에는 **다시 생성**(retry_journal_generation)을 둔다 — "초안 생성" 버튼은 없다(초안은 대화 종료 시 자동).
//    대화에서 자동으로 만들어지는 일지는 생성 중·생성 실패일 수 있어 **본문 대신 그 상태를** 적는다(없는 내용을 만들지 않는다).
//    삭제는 확정 전 수기 일지만 된다(서버 규칙) — 그 밖에는 휴지통을 두지 않는다.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  toElderProfile,
  useDeleteProgramJournal,
  useProfile,
  useProgramJournals,
  useRetryJournalGeneration,
} from '@giokon/data';
import { dateDot } from '@giokon/core';
import { asset } from '../../assets/ui';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { JournalStatusChip } from '../../components/JournalStatusChip';
import { useStore } from '../../store/store';
import { journalErrorMessage } from '../../lib/journalErrors';
import { Y } from '../../lib/figmaY';
import { dayKey } from '../../lib/format';
import { hhmm, journalSummary, journalTitle } from '../../lib/programJournal';

const CARD_TOP = 376;
const ROW_TOP = 427.27;
const ROW_H = 235.15;
const ROW_PITCH = 259.164;
/** 마지막 행 아래 카드 여백(시안: 4행 끝 1439.91 → 카드 끝 1492). */
const CARD_PAD_BOTTOM = 52.09;

export function ProgramJournalListPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const profileQuery = useProfile(elderId);
  const journals = useProgramJournals(elderId);
  const remove = useDeleteProgramJournal();
  const retry = useRetryJournalGeneration();
  const toast = useStore((s) => s.toast);
  const [day, setDay] = useState('');
  /** "확인 대기 N건"을 누르면 확인 대기만 본다. */
  const [pendingOnly, setPendingOnly] = useState(false);
  /** 삭제 확인 대상 — 되돌릴 수 없어 확인을 받는다(네이티브 confirm 금지). */
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  const pendingCount = useMemo(
    () => (journals.data ?? []).filter((j) => j.status === 'pending_review').length,
    [journals.data],
  );
  const rows = useMemo(() => {
    const all = (journals.data ?? []).filter((j) => !pendingOnly || j.status === 'pending_review');
    return day ? all.filter((j) => dayKey(j.journal_date) === day) : all;
  }, [journals.data, day, pendingOnly]);

  const slots = Math.max(rows.length, 1);
  const cardBottom = ROW_TOP + slots * ROW_PITCH - (ROW_PITCH - ROW_H) + CARD_PAD_BOTTOM;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: cardBottom + 87 - 122 }}>
      <Link
        to="/caregiver/journal"
        data-fx="210:1531"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 322, top: Y(194.12) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        목록으로
      </Link>
      <h1
        data-fx="210:1528"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(243) }}
      >
        {elder ? `${elder.name} 어르신의 프로그램 일지` : '프로그램 일지 목록'}
      </h1>
      <p
        data-fx="210:1529"
        className="absolute left-[322px] w-[519px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(293.19), wordBreak: 'keep-all' }}
      >
        대화가 끝나면 AI가 일지 초안을 만들어요. 연필 모양을 누르시면 내용을 확인·수정하고
        확정할 수 있습니다.
      </p>

      <Link
        to={`/caregiver/journal/${elderId ?? ''}/new`}
        data-fx="210:1525"
        className="absolute flex h-[57px] w-[185px] items-center justify-center gap-[8px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white"
        style={{ left: 1194, top: Y(188) }}
      >
        <span className="text-w-section leading-[30px]">+</span>새 프로그램 일지
      </Link>

      {/* 확인 대기 N건 — 목록 최상단(날짜 선택과 같은 줄). 날짜 선택과 같은 틀(r5 · 1px · h37.02 · 글자 16). */}
      <button
        type="button"
        aria-pressed={pendingOnly}
        disabled={pendingCount === 0 && !pendingOnly}
        onClick={() => setPendingOnly((v) => !v)}
        className={
          'absolute flex h-[37.02px] -translate-x-full items-center gap-[8px] whitespace-nowrap rounded-[5px] border px-[14px] text-[16px] leading-[30px] disabled:cursor-default ' +
          (pendingOnly ? 'border-accent bg-accent-tint font-semibold text-ink-900' : 'border-line bg-white text-ink-900')
        }
        style={{ left: 1209 - 12, top: Y(316.2) }}
      >
        <span aria-hidden className="h-[8px] w-[8px] rounded-full bg-accent" />
        확인 대기 {pendingCount}건{pendingOnly ? ' · 전체 보기' : ''}
      </button>

      {/* 날짜 선택 — 여는 화면이 디자인에 없어 네이티브 날짜 선택기를 투명하게 덮는다 */}
      <div
        data-fx="210:1421"
        className="absolute left-[1209px] h-[37.02px] w-[170px] rounded-[5px] border border-line bg-white focus-within:border-accent"
        style={{ top: Y(316.2) }}
      >
        <img
          src={asset.iconCalendarSm}
          alt=""
          width={22}
          height={22}
          className="pointer-events-none absolute left-[13px] top-1/2 block -translate-y-1/2"
        />
        <span
          data-fx="210:1422"
          className="pointer-events-none absolute left-[47px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[16px] leading-[30px] text-ink-500"
        >
          {day ? day.replace(/-/g, '.') : '날짜 선택하기'}
        </span>
        <img
          src={asset.iconChevronDownSm}
          alt=""
          width={12}
          height={7.81}
          className="pointer-events-none absolute left-[144px] top-1/2 block -translate-y-1/2"
        />
        <input
          type="date"
          aria-label="일지 날짜로 거르기"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div
        data-fx="210:1656"
        className="absolute left-[322px] w-[1057px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardBottom - CARD_TOP }}
      />

      {rows.length === 0 ? (
        <div
          className="absolute left-[410px] flex w-[879px] flex-col items-center gap-[12px]"
          style={{ top: Y(ROW_TOP + 80) }}
        >
          <p className="text-w-body leading-[30px] text-ink-500">
            {pendingOnly
              ? '확인 대기 중인 일지가 없습니다.'
              : day
                ? '선택한 날짜의 프로그램 일지가 없습니다.'
                : '아직 프로그램 일지가 없습니다. 대화가 끝나면 자동으로 만들어져요.'}
          </p>
          {day || pendingOnly ? (
            <button
              type="button"
              onClick={() => {
                setDay('');
                setPendingOnly(false);
              }}
              className="text-w-sub font-semibold leading-[30px] text-accent underline"
            >
              전체 보기
            </button>
          ) : null}
        </div>
      ) : (
        rows.map((j, i) => {
          const top = ROW_TOP + i * ROW_PITCH;
          return (
            <div key={j.id}>
              <div
                data-fx={i === 0 ? '210:1649' : undefined}
                className="absolute left-[410px] w-[879px] rounded-[10px] border border-line bg-white"
                style={{ top: Y(top), height: ROW_H }}
              />
              <JournalStatusChip
                fx={i === 0 ? '210:1651' : undefined}
                status={j.status}
                className="absolute left-[459px]"
                style={{ top: Y(top + 41.73) }}
              />
              <span
                data-fx={i === 0 ? '210:1653' : undefined}
                className="absolute left-[585px] whitespace-nowrap text-w-body leading-[28px] text-ink-500"
                style={{ top: Y(top + 46.03) }}
              >
                {dateDot(j.journal_date)}
              </span>
              {/* 활동 시간 — 적었을 때만 날짜 뒤에 붙인다. 없으면 만들지 않는다.
                  (날짜 span 은 실측 프로브라 건드리지 않고 옆에 따로 놓는다.) */}
              {j.operated_from || j.operated_to ? (
                <span
                  className="absolute left-[700px] whitespace-nowrap text-w-body leading-[28px] text-ink-500"
                  style={{ top: Y(top + 46.03) }}
                >
                  {hhmm(j.operated_from)} ~ {hhmm(j.operated_to)}
                </span>
              ) : null}
              <p
                data-fx={i === 0 ? '210:1650' : undefined}
                className="absolute left-[478px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
                style={{ top: Y(top + 73.73) }}
              >
                {journalTitle(j.journal_date)}
              </p>
              <p
                data-fx={i === 0 ? '210:1654' : undefined}
                className="absolute left-[478px] w-[680px] text-w-body leading-[28px] text-ink-700"
                style={{ top: Y(top + 138.09), wordBreak: 'keep-all' }}
              >
                {journalSummary(j)}
              </p>
              {/* 생성 실패 복구 — 실패한 일지에만(서버도 failed 가 아니면 거절한다). 연필 왼쪽, 행 가운데. */}
              {j.status === 'failed' ? (
                <button
                  type="button"
                  disabled={retry.isPending}
                  onClick={() =>
                    elderId &&
                    retry.mutate(
                      { id: j.id, profileId: elderId },
                      {
                        onSuccess: () => toast('success', '초안을 다시 만들고 있어요. 끝나면 확인 대기로 바뀌어요.'),
                        onError: (e) => toast('error', journalErrorMessage(e, '다시 생성하지 못했어요.')),
                      },
                    )
                  }
                  className="absolute h-[44px] whitespace-nowrap rounded-[10px] border border-accent bg-white px-[18px] text-w-sub font-semibold text-accent disabled:opacity-60"
                  style={{ left: 976, top: Y(top + 92) }}
                >
                  다시 생성
                </button>
              ) : null}
              <Link
                to={`/caregiver/journal/${elderId ?? ''}/${j.id}`}
                aria-label={`${journalTitle(j.journal_date)} 열기`}
                className="absolute block"
                style={{ left: 1120, top: Y(top + 103.73), width: 28, height: 28 }}
              >
                <img src={asset.iconPencilLg} alt="" className="block h-full w-full" />
              </Link>
              {/* 삭제 확인 화면이 디자인에 없어 확인 대화상자로 되돌릴 수 없는 동작을 막는다.
                  확정·대화 일지는 서버가 삭제를 막으므로 버튼을 두지 않는다(누를 수 있어 보이면 동작해야 한다). */}
              {j.status !== 'final' && j.session_id === null ? (
              <button
                type="button"
                aria-label={`${journalTitle(j.journal_date)} 삭제`}
                onClick={() => setDeleting({ id: j.id, label: journalTitle(j.journal_date) })}
                className="absolute block"
                style={{ left: 1179, top: Y(top + 104.07), width: 26.97, height: 27.02 }}
              >
                <img src={asset.iconTrash} alt="" className="block h-full w-full object-contain" />
              </button>
              ) : null}
            </div>
          );
        })
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="프로그램 일지를 삭제할까요?"
        description={deleting ? `${deleting.label}를 삭제합니다. 되돌릴 수 없어요.` : ''}
        confirmLabel="삭제"
        onConfirm={() => {
          if (!deleting || !elderId) return;
          remove.mutate(
            { id: deleting.id, profileId: elderId },
            {
              onSuccess: () => toast('success', '프로그램 일지를 삭제했어요.'),
              onError: (e) => toast('error', journalErrorMessage(e, '삭제하지 못했어요.')),
            },
          );
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
