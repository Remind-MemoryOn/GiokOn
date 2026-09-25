// 회상 세션 설계 (Figma 196:272 — 카드 1054×919, 세션 목록 위에 뜨는 모달)
//   제목 Bold 25/70 @(87,27) · 세션 제목* 879×57 @(87,139.15) + 0/50
//   목표* 879×57 @(87,252.27) + 0/200 · 예상 소요 시간 142×57 @(87,368.40)
//   기록일 219×57 @(263,368.40) · 내용 879×57 @(87,483.53) + 0/500
//   피해갈 내용 880×57 @(87,599.65) · 관련 키워드 880×57 @(87,715.78) · 취소/저장 @(656|826, 813)
//
// 설계 값은 **앱의 대화 진행에 직접 쓰인다** — 피해갈 내용은 안전 가드, 목표·키워드는
// 질문 생성 입력이다. 저장하면 `sessions` 에 status='planned' 행이 생기고 앱이 그것을 받는다.
//
// ⚠️ 시안은 내용·피해갈 내용 상자를 한 줄(57)로 그렸지만 각각 500자를 받는다 →
//    **연대기 모달과 같은 이유로 여러 줄 상자**로 만든다(높이는 아래 표에서 계산).
// ⚠️ 필수 표시(✱)는 시안 그대로 **세션 제목·목표 둘뿐**이다.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCreateSession,
  useCurrentUser,
  useSessions,
  useUpdateSession,
} from '@giokon/data';
import { asset } from '../../assets/ui';
import { useStore } from '../../store/store';
import { useModalA11y } from '../../lib/modalA11y';

const TITLE_MAX = 50;
const GOAL_MAX = 200;
const CONTENT_MAX = 500;
const AVOID_MAX = 500;
/** 카운터는 길이가 변해도 오른끝 935 에 붙는다(0/50·0/200·0/500 공통). */
const COUNTER_RIGHT = 1054 - 935;
/** 예상 소요 시간 드롭다운 — DB 제약(5~120분) 안의 실제 회상 대화 길이. */
const DURATIONS = [10, 15, 20, 30, 40];

/**
 * 여러 줄로 늘린 상자만큼 아래 요소가 내려간다.
 * 시안의 한 줄 높이(57.06)를 기준으로 늘어난 만큼만 더한다.
 */
const LINE_H = 57.06;
const CONTENT_H = 138;
const AVOID_H = 138;
const GROW = CONTENT_H - LINE_H + (AVOID_H - LINE_H);

const VALUE = 'text-w-sub leading-[21px] text-ink-900';
const PLACEHOLDER = 'text-w-sub leading-[21px] text-ink-500';

function Label({
  fx,
  left,
  top,
  star,
  htmlFor,
  children,
}: {
  fx: string;
  left: number;
  top: number;
  star?: { left: number; top: number };
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label
        data-fx={fx}
        htmlFor={htmlFor}
        className="absolute whitespace-nowrap text-w-body font-medium leading-[24px] text-ink-900"
        style={{ left, top }}
      >
        {children}
      </label>
      {star ? (
        <span
          className="absolute text-[12px] font-medium leading-[30px] text-accent"
          style={{ left: star.left, top: star.top }}
          aria-hidden
        >
          ✱
        </span>
      ) : null}
    </>
  );
}

interface Values {
  title: string;
  goal: string;
  minutes: number;
  plannedDate: string;
  content: string;
  avoid: string;
  keywords: string[];
}

export function SessionPlanDialog() {
  const { elderId, sessionId } = useParams<{ elderId: string; sessionId: string }>();
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const sessions = useSessions(elderId);
  const currentUser = useCurrentUser();
  const create = useCreateSession();
  const update = useUpdateSession();

  const row = useMemo(
    () => (sessionId ? (sessions.data ?? []).find((s) => s.id === sessionId) : undefined),
    [sessions.data, sessionId],
  );
  const close = () => navigate(`/caregiver/sessions/${elderId ?? ''}`);

  return (
    <Form
      key={row?.id ?? 'new'}
      pending={create.isPending || update.isPending}
      onClose={close}
      initial={{
        title: row?.title ?? '',
        goal: row?.goal ?? '',
        minutes: row?.duration_minutes ?? 15,
        plannedDate: row?.planned_date ?? new Date().toISOString().slice(0, 10),
        content: row?.content ?? '',
        avoid: row?.avoid_topics ?? '',
        keywords: row?.keywords ?? [],
      }}
      onSave={(v) => {
        if (!elderId) return;
        if (!v.title.trim()) return toast('error', '세션 제목을 입력해 주세요.');
        if (!v.goal.trim()) return toast('error', '목표를 입력해 주세요.');
        const patch = {
          title: v.title.trim(),
          goal: v.goal.trim(),
          duration_minutes: v.minutes,
          planned_date: v.plannedDate,
          content: v.content.trim() || null,
          avoid_topics: v.avoid.trim() || null,
          keywords: v.keywords,
        };
        const done = {
          onSuccess: () => {
            toast('success', row ? '세션 설계를 저장했어요.' : '세션을 설계했어요. 앱에서 진행할 수 있어요.');
            close();
          },
          onError: (err: Error) => toast('error', err.message),
        };
        if (row) return update.mutate({ id: row.id, patch }, done);
        const userId = currentUser.data?.id;
        if (!userId) return toast('error', '로그인 정보를 확인할 수 없어요.');
        create.mutate({ profile_id: elderId, user_id: userId, status: 'planned', ...patch }, done);
      }}
    />
  );
}

function Form({
  initial,
  pending,
  onSave,
  onClose,
}: {
  initial: Values;
  pending: boolean;
  onSave: (v: Values) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const [kw, setKw] = useState('');
  // 시안 치수를 직접 그린 모달이라 공용 Dialog 를 쓰지 않는다 — 키보드 동작만 공유한다.
  const panel = useModalA11y(true, onClose);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));

  // 늘어난 내용 상자만큼 그 아래가 내려간다.
  const avoidTop = 599.65 + (CONTENT_H - LINE_H);
  const kwTop = 715.78 + GROW;
  const btnTop = 813 + GROW;

  function addKeyword() {
    const t = kw.trim().replace(/,$/, '');
    if (!t || v.keywords.includes(t)) return setKw('');
    set('keywords', [...v.keywords, t]);
    setKw('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/30 py-[40px]"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        data-fx="195:356"
        role="dialog"
        aria-modal="true"
        aria-label="회상 세션 설계"
        className="relative w-[1054px] shrink-0 rounded-[10px] bg-white shadow-card"
        style={{ height: 919 + GROW }}
      >
        <h2
          data-fx="195:357"
          className="absolute left-[87px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          회상 세션 설계
        </h2>

        <Label fx="195:361" left={88} top={104.11} star={{ left: 163, top: 93 }} htmlFor="p-title">
          세션 제목
        </Label>
        <input
          data-fx="195:362"
          id="p-title"
          value={v.title}
          maxLength={TITLE_MAX}
          onChange={(e) => set('title', e.target.value)}
          placeholder="예) 어린 시절 집 앞의 감나무 이야기"
          className={`absolute left-[87px] h-[57.06px] w-[879px] rounded-[10px] border border-line bg-white pl-[29px] pr-[110px] focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          style={{ top: 139.15 }}
        />
        <span
          data-fx="195:398"
          className={`absolute ${PLACEHOLDER}`}
          style={{ right: COUNTER_RIGHT, top: 157.17 }}
        >
          {v.title.length}/{TITLE_MAX}
        </span>

        <Label fx="195:379" left={88} top={217.24} star={{ left: 124, top: 206 }} htmlFor="p-goal">
          목표
        </Label>
        <input
          data-fx="195:380"
          id="p-goal"
          value={v.goal}
          maxLength={GOAL_MAX}
          onChange={(e) => set('goal', e.target.value)}
          placeholder="이 세션을 통해 어르신과 나누고 싶은 이야기를 입력하세요."
          className={`absolute left-[87px] h-[57.06px] w-[879px] rounded-[10px] border border-line bg-white pl-[29px] pr-[110px] focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          style={{ top: 252.27 }}
        />
        <span
          data-fx="195:400"
          className={`absolute ${PLACEHOLDER}`}
          style={{ right: COUNTER_RIGHT, top: 270.29 }}
        >
          {v.goal.length}/{GOAL_MAX}
        </span>

        <Label fx="195:365" left={88} top={333.36} htmlFor="p-minutes">
          예상 소요 시간
        </Label>
        <div
          data-fx="195:366"
          className="absolute left-[87px] h-[57.06px] w-[142px] rounded-[10px] border border-line bg-white focus-within:border-accent"
          style={{ top: 368.4 }}
        >
          <span data-fx="195:367" className={`pointer-events-none absolute left-[29px] top-[18.02px] ${VALUE}`}>
            {v.minutes}분
          </span>
          <img
            src={asset.iconChevronDownMd}
            alt=""
            width={19.29}
            height={13.02}
            className="pointer-events-none absolute left-[97.13px] top-1/2 block -translate-y-1/2"
          />
          <select
            id="p-minutes"
            value={v.minutes}
            onChange={(e) => set('minutes', Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m}분
              </option>
            ))}
          </select>
        </div>

        <Label fx="195:406" left={264} top={333.36} htmlFor="p-date">
          기록일
        </Label>
        <div
          data-fx="195:407"
          className="absolute left-[263px] h-[57.06px] w-[219px] rounded-[10px] border border-line bg-white focus-within:border-accent"
          style={{ top: 368.4 }}
        >
          <span data-fx="195:408" className={`pointer-events-none absolute left-[29px] top-[18.02px] whitespace-pre ${VALUE}`}>
            {v.plannedDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/ $2/$3')}
          </span>
          <img
            data-fx="195:423"
            src={asset.iconCalendarSm}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute left-[169px] top-[18.02px] block"
          />
          <input
            id="p-date"
            type="date"
            aria-label="세션 예정일"
            value={v.plannedDate}
            onChange={(e) => set('plannedDate', e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <Label fx="195:369" left={89} top={443.48} htmlFor="p-content">
          내용
        </Label>
        <textarea
          data-fx="195:370"
          id="p-content"
          value={v.content}
          maxLength={CONTENT_MAX}
          onChange={(e) => set('content', e.target.value)}
          placeholder="AI가 어떤 이야기를 나눌지 자세히 적어주세요."
          className={`absolute left-[87px] w-[879px] resize-none rounded-[10px] border border-line bg-white px-[29px] pb-[36px] pt-[18px] leading-[28px] focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          style={{ top: 483.53, height: CONTENT_H }}
        />
        <span
          data-fx="195:404"
          className={`absolute ${PLACEHOLDER}`}
          style={{ right: COUNTER_RIGHT, top: 483.53 + CONTENT_H - 37 }}
        >
          {v.content.length}/{CONTENT_MAX}
        </span>

        <Label fx="195:372" left={89} top={565.61 + (CONTENT_H - LINE_H)} htmlFor="p-avoid">
          피해갈 내용
        </Label>
        <textarea
          data-fx="195:373"
          id="p-avoid"
          value={v.avoid}
          maxLength={AVOID_MAX}
          onChange={(e) => set('avoid', e.target.value)}
          placeholder="어르신이 불편해하실 수 있는 주제나 내용을 입력하세요."
          className={`absolute left-[87px] w-[880px] resize-none rounded-[10px] border border-line bg-white px-[29px] py-[18px] leading-[28px] focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          style={{ top: avoidTop, height: AVOID_H }}
        />

        <Label fx="195:425" left={89} top={kwTop - 34.04} htmlFor="p-keyword">
          관련 키워드
        </Label>
        <div
          data-fx="195:426"
          className="absolute left-[87px] flex h-[57.06px] w-[880px] items-center gap-[9px] rounded-[10px] border border-line bg-white pl-[28px] pr-[29px] focus-within:border-accent"
          style={{ top: kwTop }}
        >
          {v.keywords.map((k) => (
            <span
              key={k}
              className="inline-flex h-[30px] shrink-0 items-center rounded-pill bg-mute pl-[17px] pr-[17px]"
            >
              <span className="text-w-sub font-medium leading-[28px] text-ink-400">{k}</span>
              <button
                type="button"
                aria-label={`키워드 ${k} 삭제`}
                onClick={() => set('keywords', v.keywords.filter((x) => x !== k))}
                className="ml-[12px] block"
              >
                <img src={asset.iconCloseSm} alt="" width={11} height={11} className="block" />
              </button>
            </span>
          ))}
          <input
            id="p-keyword"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addKeyword();
              }
            }}
            onBlur={addKeyword}
            placeholder="대화 내용과 관련된 키워드를 입력하세요."
            className={`h-full min-w-[120px] flex-1 bg-transparent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          />
        </div>

        <button
          type="button"
          data-fx="195:389"
          onClick={onClose}
          className="absolute left-[656px] h-[57px] w-[140px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
          style={{ top: btnTop }}
        >
          취소
        </button>
        <button
          type="button"
          data-fx="195:392"
          onClick={() => onSave(v)}
          disabled={pending}
          className="absolute left-[826px] h-[57px] w-[140px] rounded-[10px] border border-accent bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-50"
          style={{ top: btnTop }}
        >
          {pending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}
