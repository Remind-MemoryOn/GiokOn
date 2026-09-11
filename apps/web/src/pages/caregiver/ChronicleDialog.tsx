// 연대기 추가 (Figma 196:271) · 연대기 상세 정보 (Figma 198:991) — 같은 다이얼로그의 두 상태
//   카드 1054 @0 r10 shadow-card · 제목 Bold 25/70 @(87,26)
//   작성자 172×57.08 @(87,139.20) · 유형 172×57.08 @(298,139.20) · 기록일 219×57.08 @(509,139.20)
//   제목 879×57.08 @(87,271.32) + 0/50 @896 · 내용 879×196.23 @(87,384.46) + n/500 @868,537.64
//   관련 키워드 880×57.08 @(87,637.76) — 칩 h30 r100 @115 · 취소/저장 140×57 @(656|826, 735)
//
// ⚠️ Figma 는 **추가 프레임에서만** 내용 상자를 한 줄(57.08)로 그렸다. 500자를 받는 칸을
//    한 줄로 두면 쓸 수 없어 **상세 프레임의 196.23 으로 통일**한다(그래서 추가 다이얼로그도
//    841 높이다). 나머지 좌표는 두 프레임이 같다.
// ⚠️ **작성자는 바꿀 수 없다.** 디자인은 드롭다운이지만, 고를 수 있는 값이 "AI 자동 ↔
//    요양보호사" 뿐이라 실제로는 AI 생성물을 사람이 쓴 것으로 바꿔 다는 용도밖에 안 된다
//    (AI 투명성 원칙 위반). 자리·글자는 디자인 그대로 두고 ∨ 만 흐리게 해 열리지 않음을 알린다.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useChronicles,
  useCreateChronicle,
  useCurrentUser,
  useUpdateChronicle,
} from '@giokon/data';
import { CHRONICLE_TOPICS } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useStore } from '../../store/store';
import { useModalA11y } from '../../lib/modalA11y';

const TITLE_MAX = 50;
const CONTENT_MAX = 500;
/** 내용 상자 높이 — 두 프레임 중 실제로 쓸 수 있는 쪽(상세 198:861)으로 통일한다. */
const CONTENT_H = 196.23;
/** 글자 수 카운터는 길이가 변해도 **오른끝 935** 에 붙는다(Figma 0/50·0/500·157/500 공통). */
const COUNTER_RIGHT = 1054 - 935;

/** 라벨(Medium 20) + 필수 별표. */
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
  /** 필수 별표 — Figma 가 라벨마다 다른 높이에 놨다(실측 좌표를 그대로 받는다). */
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

/** 값 글자(Regular 18) — 상자 좌측 +29, 세로 중앙. */
const VALUE = 'text-w-sub leading-[21px] text-ink-900';
const PLACEHOLDER = 'text-w-sub leading-[21px] text-ink-500';

export function ChronicleDialog({ mode }: { mode: 'add' | 'edit' }) {
  const { elderId, chronicleId } = useParams<{ elderId: string; chronicleId: string }>();
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const chronicles = useChronicles(elderId);
  const currentUser = useCurrentUser();
  const create = useCreateChronicle();
  const update = useUpdateChronicle();

  const row = useMemo(
    () => (chronicleId ? (chronicles.data ?? []).find((c) => c.id === chronicleId) : undefined),
    [chronicles.data, chronicleId],
  );
  const editing = mode === 'edit';

  return (
    <Form
      key={row?.id ?? 'new'}
      editing={editing}
      // 저장 직전에만 필요한 값이라 폼에는 넘기지 않는다.
      onClose={() => navigate(`/caregiver/elders/${elderId ?? ''}/chronicles`)}
      initial={{
        source: row?.source ?? 'caregiver',
        topic: row?.topic ?? CHRONICLE_TOPICS[0],
        recordedAt: (row?.recorded_at ?? new Date().toISOString()).slice(0, 10),
        title: row?.title ?? '',
        content: row?.content ?? '',
        keywords: row?.keywords ?? [],
      }}
      pending={create.isPending || update.isPending}
      onSave={(v) => {
        if (!elderId) return;
        if (!v.title.trim()) return toast('error', '제목을 입력해주세요.');
        if (!v.content.trim()) return toast('error', '내용을 입력해주세요.');
        const patch = {
          topic: v.topic,
          title: v.title.trim(),
          content: v.content.trim(),
          keywords: v.keywords,
          recorded_at: new Date(`${v.recordedAt}T00:00:00`).toISOString(),
        };
        const done = {
          onSuccess: () => {
            toast('success', editing ? '연대기를 저장했어요.' : '연대기를 추가했어요.');
            navigate(`/caregiver/elders/${elderId}/chronicles`);
          },
          onError: (err: Error) => toast('error', err.message),
        };
        if (editing && row) return update.mutate({ id: row.id, patch }, done);
        const userId = currentUser.data?.id;
        if (!userId) return toast('error', '로그인 정보를 확인할 수 없어요.');
        create.mutate({ profile_id: elderId, user_id: userId, source: 'caregiver', ...patch }, done);
      }}
    />
  );
}

interface Values {
  source: 'ai' | 'caregiver';
  topic: string;
  recordedAt: string;
  title: string;
  content: string;
  keywords: string[];
}

function Form({
  editing,
  initial,
  pending,
  onSave,
  onClose,
}: {
  editing: boolean;
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

  // 유형 드롭다운은 표준 목록 + 지금 값(구 데이터·AI 가 붙인 주제)을 함께 보여 준다.
  const topics = CHRONICLE_TOPICS.includes(v.topic) ? CHRONICLE_TOPICS : [v.topic, ...CHRONICLE_TOPICS];

  const kwTop = 637.76;
  const btnTop = 735;
  const cardH = 841;

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
        data-fx={editing ? '198:828' : '195:440'}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '연대기 상세 정보' : '연대기 추가'}
        className="relative w-[1054px] shrink-0 rounded-[10px] bg-white shadow-card"
        style={{ height: cardH }}
      >
        <h2
          data-fx={editing ? '198:829' : '195:441'}
          className="absolute left-[87px] top-[26px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          {editing ? '연대기 상세 정보' : '연대기 추가'}
        </h2>

        {/* 작성자 — 기록을 만든 주체라 바꿀 수 없다(모양만 디자인 그대로) */}
        <Label fx={editing ? '198:830' : '195:448'} left={88} top={104.12} star={{ left: 140, top: 91 }} htmlFor="c-source">
          작성자
        </Label>
        <div
          data-fx={editing ? '198:831' : '195:449'}
          className="absolute left-[87px] flex h-[57.07px] w-[172px] items-center rounded-[10px] border border-line bg-white"
          style={{ top: 139.17 }}
          title="작성자는 기록을 만든 주체라 바꿀 수 없어요."
        >
          <span id="c-source" className={`ml-[29px] ${VALUE}`}>
            {v.source === 'ai' ? 'AI 자동' : '요양보호사'}
          </span>
          <img
            src={asset.iconChevronDownMd}
            alt=""
            width={19.29}
            height={13.02}
            className="absolute left-[127.13px] opacity-40 top-1/2 block -translate-y-1/2"
          />
        </div>

        <Label fx={editing ? '198:852' : '196:172'} left={299} top={104.12} star={{ left: 332, top: 91 }} htmlFor="c-topic">
          유형
        </Label>
        <div
          data-fx={editing ? '198:853' : '196:173'}
          className="absolute left-[298px] h-[57.07px] w-[172px] rounded-[10px] border border-line bg-white focus-within:border-accent"
          style={{ top: 139.17 }}
        >
          <span className={`pointer-events-none absolute left-[29px] top-[19.02px] ${VALUE}`}>{v.topic}</span>
          <img
            src={asset.iconChevronDownMd}
            alt=""
            width={19.29}
            height={13.02}
            className="pointer-events-none absolute left-[127.13px] top-1/2 block -translate-y-1/2"
          />
          <select
            id="c-topic"
            value={v.topic}
            onChange={(e) => set('topic', e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <Label fx={editing ? '198:864' : '196:166'} left={510} top={104.12} htmlFor="c-date">
          기록일
        </Label>
        <div
          data-fx={editing ? '198:865' : '196:167'}
          className="absolute left-[509px] h-[57.07px] w-[219px] rounded-[10px] border border-line bg-white focus-within:border-accent"
          style={{ top: 139.17 }}
        >
          <span className={`pointer-events-none absolute left-[29px] top-[19.02px] whitespace-pre ${VALUE}`}>
            {v.recordedAt.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/ $2/$3')}
          </span>
          <img
            src={asset.iconCalendarSm}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute left-[169px] top-[18.02px] block"
          />
          <input
            id="c-date"
            type="date"
            value={v.recordedAt}
            onChange={(e) => set('recordedAt', e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <Label fx={editing ? '198:846' : '195:442'} left={88} top={236.31} star={{ left: 125, top: 225 }} htmlFor="c-title">
          제목
        </Label>
        <input
          data-fx={editing ? '198:847' : '195:443'}
          id="c-title"
          value={v.title}
          maxLength={TITLE_MAX}
          onChange={(e) => set('title', e.target.value)}
          placeholder="예) 어린 시절 집 앞의 감나무 이야기"
          className={`absolute left-[87px] h-[57.07px] w-[879px] rounded-[10px] border border-line bg-white pl-[29px] pr-[110px] focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          style={{ top: 271.35 }}
        />
        <span
          data-fx={editing ? '198:849' : '195:445'}
          className={`absolute ${PLACEHOLDER}`}
          style={{ right: COUNTER_RIGHT, top: 289.38 }}
        >
          {v.title.length}/{TITLE_MAX}
        </span>

        <Label fx={editing ? '198:860' : '195:468'} left={88} top={349.45} star={{ left: 124, top: 338 }} htmlFor="c-content">
          내용
        </Label>
        <textarea
          data-fx={editing ? '198:861' : '195:469'}
          id="c-content"
          value={v.content}
          maxLength={CONTENT_MAX}
          onChange={(e) => set('content', e.target.value)}
          placeholder="해당 시기에 있었던 주요 사건, 기억, 경험을 자세히 입력해주세요."
          className={`absolute left-[87px] w-[879px] resize-none rounded-[10px] border border-line bg-white px-[29px] pb-[46px] pt-[18px] leading-[28px] focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
          style={{ top: 384.5, height: CONTENT_H }}
        />
        <span
          data-fx={editing ? '198:863' : '195:477'}
          className={`absolute ${PLACEHOLDER}`}
          style={{ right: COUNTER_RIGHT, top: 537.64 }}
        >
          {v.content.length}/{CONTENT_MAX}
        </span>

        <Label fx={editing ? '198:833' : '195:457'} left={89} top={kwTop - 34.04} htmlFor="c-keyword">
          관련 키워드
        </Label>
        <div
          data-fx={editing ? '198:834' : '195:459'}
          className="absolute left-[87px] flex h-[57.07px] w-[880px] items-center gap-[9px] rounded-[10px] border border-line bg-white pl-[28px] pr-[29px] focus-within:border-accent"
          style={{ top: kwTop }}
        >
          {v.keywords.map((k, i) => (
            <span
              key={k}
              data-fx={editing && i === 0 ? '198:870' : undefined}
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
            id="c-keyword"
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
          data-fx={editing ? '198:841' : '195:472'}
          onClick={onClose}
          className="absolute left-[656px] h-[57px] w-[140px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
          style={{ top: btnTop }}
        >
          취소
        </button>
        <button
          type="button"
          data-fx={editing ? '198:844' : '195:475'}
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
