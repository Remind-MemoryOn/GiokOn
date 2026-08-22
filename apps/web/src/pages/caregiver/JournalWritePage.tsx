// 요양일지 작성 (Figma 221:283 타이핑 · 221:1060 음성 입력 · 221:1196 사진 첨부 — 1440×1308)
//   한 화면의 세 가지 입력 방식이다 — 탭만 바뀌고 위아래는 같다. 감사에서 방식별로
//   들어갈 수 있게 `?mode=typed|voice|photo` 로 고른다(기본 typed).
//
//   제목 @169 · 부제 @236.18 · 돌아가기 @(1285,197.15) · 카드 1057×928 @(322,295)
//   카드 안(카드 좌상단 기준): 오늘의 활동 @(87,27) ·
//     기록일 라벨 @(88,106.31) · 입력 219×57 @(87,141.33) ·
//     활동 시간 라벨 @(345,106.31) · 시작 145×57 @(345,142.33) · ~ @(512,157.35) ·
//       종료 145×57 @(548,142.33) ·
//     담당 요양보호사 라벨 @(733,106.31) · 입력 234×57 @(732,141.33) ·
//     활동 입력 라벨 @(88,252.42) · 방식 탭 262/261/262×57 @(87|396|704, 288.45) ·
//     임시 저장 140×57 @(656,813) · 저장 140×57 @(826,813)
//
// ⚠️ 실 STT(CLOVA)·실 LLM 은 아직 붙지 않았다(MVP 이후 무변경 전환). 음성 파일을 올리면
//    **파일만 보관**하고 텍스트는 자동으로 채우지 않는다 — 없는 인식 결과를 만들지 않는다.
// ⚠️ 사진은 `journal_photos`(20260822030000) 에 여러 장 저장한다. Storage 정책이 경로의
//    profile_id 로 기관을 확인하므로 경로는 `<profile_id>/…` 이고, **일지 행이 먼저** 있어야
//    첨부를 붙일 수 있다(저장 → 업로드 → 첨부 행 순서).
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useAddJournalPhoto,
  useCreateCareJournal,
  useCurrentUser,
} from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { uploadJournalPhoto } from '../../lib/journalPhotos';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;

const CARD_TOP = 295;
const COL = 87; // 카드 안 콘텐츠 왼쪽(409 - 322)

type Mode = 'typed' | 'voice' | 'photo';
const MODES: { key: Mode; label: string; icon: string; w: number; iw: number; ih: number; left: number; iconLeft: number; textLeft: number }[] = [
  { key: 'typed', label: '직접 입력', icon: asset.iconKeyboard, w: 262, iw: 26, ih: 18.01, left: 87, iconLeft: 80, textLeft: 116 },
  { key: 'voice', label: '음성 입력', icon: asset.iconMic, w: 261, iw: 16.5, ih: 22.02, left: 396, iconLeft: 84, textLeft: 115 },
  { key: 'photo', label: '사진 첨부', icon: asset.iconCameraTab, w: 262, iw: 23, ih: 20.02, left: 704, iconLeft: 80, textLeft: 115 },
];

/** 사진 슬롯 — 187×193, 가로 피치 231(시안 4칸). */
const SLOT = { w: 187, h: 193, top: 363, xs: [87, 318, 549, 780] };

const FIELD = 'absolute rounded-[10px] border border-line bg-white text-[18px] leading-[21px] text-ink-500 focus:border-accent focus:outline-none';
const LABEL = 'absolute whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900';

/** 오늘 날짜(로컬) — `2026-07-30`. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function JournalWritePage() {
  const { elderId } = useParams<{ elderId: string }>();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);

  const modeParam = search.get('mode');
  const mode: Mode = modeParam === 'voice' || modeParam === 'photo' ? modeParam : 'typed';
  const setMode = (m: Mode) => setSearch(m === 'typed' ? {} : { mode: m }, { replace: true });

  const me = useCurrentUser();
  const createJournal = useCreateCareJournal();
  const addPhoto = useAddJournalPhoto();

  const [date, setDate] = useState(today());
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [content, setContent] = useState('');
  /** 아직 올리지 않은 사진(저장 시 일지 행을 만든 뒤 올린다). */
  const [photos, setPhotos] = useState<File[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const voiceInput = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);

  async function save(status: 'draft' | 'final') {
    if (!elderId) return;
    if (!isConfigured) return toast('error', 'Supabase 연동 후 저장할 수 있어요.');
    if (!content.trim()) return toast('error', '활동 내용을 입력해주세요.');
    setSaving(true);
    try {
      const row = await createJournal.mutateAsync({
        profile_id: elderId,
        author_id: me.data?.id ?? null,
        journal_date: date,
        content: content.trim(),
        source: mode === 'photo' ? 'photo' : mode === 'voice' ? 'voice' : 'typed',
        status,
      });
      // 일지 행이 생긴 뒤에야 Storage 정책을 통과한다 → 저장 → 업로드 → 첨부 행 순서.
      for (const [i, file] of photos.entries()) {
        const path = await uploadJournalPhoto(elderId, file);
        await addPhoto.mutateAsync({ journal_id: row.id, path, sort: i });
      }
      toast('success', status === 'final' ? '요양일지를 저장했어요.' : '임시 저장했어요.');
      navigate(`/caregiver/journal/${elderId}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[1186px] w-[1440px]">
      <h1
        data-fx="221:342"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        새 요양일지 작성
      </h1>
      <p
        data-fx="221:343"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.18) }}
      >
        사진·음성·타이핑으로 기록하면 AI가 초안을 정리해 드려요. 저장 전 꼭 확인해 주세요.
      </p>
      <Link
        to={`/caregiver/journal/${elderId ?? ''}`}
        data-fx="221:344"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(197.15) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        돌아가기
      </Link>

      <div
        data-fx="210:1847"
        className="absolute left-[322px] h-[928px] w-[1057px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP) }}
      >
        <h2
          data-fx="210:1848"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: COL, top: 27 }}
        >
          오늘의 활동
        </h2>

        {/* 기록일 */}
        <label data-fx="221:693" className={LABEL} style={{ left: 88, top: 106.31 }} htmlFor="jw-date">
          기록일
        </label>
        <div data-fx="221:694" className={cn(FIELD, 'h-[57.04px] w-[219px]')} style={{ left: COL, top: 141.33 }}>
          <input
            id="jw-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-full w-full rounded-[10px] bg-transparent pl-[29px] pr-[40px] text-[18px] leading-[21px] text-ink-500 focus:outline-none"
          />
          <img
            src={asset.iconCalendarSm}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute left-[169px] top-[18.01px] block"
          />
        </div>

        {/* 활동 시간 */}
        <span data-fx="221:699" className={LABEL} style={{ left: 345, top: 106.31 }}>
          활동 시간
        </span>
        <div data-fx="221:700" className={cn(FIELD, 'h-[57.04px] w-[145px]')} style={{ left: 345, top: 142.33 }}>
          <input
            type="time"
            aria-label="활동 시작 시각"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-full w-full rounded-[10px] bg-transparent pl-[29px] pr-[40px] text-[18px] leading-[21px] text-ink-500 focus:outline-none"
          />
          <img
            src={asset.iconClockField}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute left-[101px] top-[18.01px] block"
          />
        </div>
        <span className="absolute text-w-body leading-[24px] text-ink-900" style={{ left: 512, top: 157.35 }}>
          ~
        </span>
        <div data-fx="221:710" className={cn(FIELD, 'h-[57.04px] w-[145px]')} style={{ left: 548, top: 142.33 }}>
          <input
            type="time"
            aria-label="활동 종료 시각"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-full w-full rounded-[10px] bg-transparent pl-[29px] pr-[40px] text-[18px] leading-[21px] text-ink-500 focus:outline-none"
          />
          <img
            src={asset.iconClockField}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute left-[101px] top-[18.01px] block"
          />
        </div>

        {/* 담당 요양보호사 — 로그인한 본인이다(고를 수 없다) */}
        <span data-fx="221:679" className={LABEL} style={{ left: 733, top: 106.31 }}>
          담당 요양보호사
        </span>
        <div
          data-fx="221:680"
          className="absolute h-[57.04px] w-[234px] rounded-[10px] border border-line bg-white"
          style={{ left: 732, top: 141.33 }}
        >
          <span className="absolute left-[29px] top-[19.01px] whitespace-nowrap text-[18px] leading-[21px] text-ink-900">
            {me.data?.name ?? '—'}
          </span>
          <img
            src={asset.iconChevronDownLg}
            alt=""
            className="pointer-events-none absolute block"
            style={{ left: 188.13, top: 22.67, width: 19.29, height: 13.02 }}
          />
        </div>

        {/* 활동 입력 — 방식 탭 */}
        <span data-fx="221:728" className={LABEL} style={{ left: 88, top: 252.42 }}>
          활동 입력
        </span>
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              data-fx={m.key === 'typed' ? '221:1016' : m.key === 'voice' ? '221:1019' : '221:1020'}
              onClick={() => setMode(m.key)}
              aria-pressed={on}
              className={cn(
                'absolute h-[57.04px] rounded-[10px] border',
                on ? 'border-accent bg-accent' : 'border-line bg-white',
              )}
              style={{ left: m.left, top: 288.45, width: m.w }}
            >
              <img
                src={m.icon}
                alt=""
                className={cn('absolute block', on && 'brightness-0 invert')}
                style={{ left: m.iconLeft, top: (57.04 - m.ih) / 2, width: m.iw, height: m.ih }}
              />
              <span
                className={cn(
                  'absolute top-[18.01px] whitespace-nowrap text-[18px] leading-[21px]',
                  on ? 'text-white' : 'text-ink-500',
                )}
                style={{ left: m.textLeft }}
              >
                {m.label}
              </span>
            </button>
          );
        })}

        {/* 방식별 입력 영역 */}
        {mode === 'typed' ? (
          <>
            <div
              data-fx="221:777"
              className="absolute rounded-[10px] border border-line bg-white"
              style={{ left: COL, top: 363.5, width: 879, height: 320.24 }}
            >
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 2000))}
                aria-label="오늘 어르신의 활동"
                placeholder="오늘 어르신의 활동을 입력해주세요."
                className="h-full w-full resize-none rounded-[10px] bg-transparent px-[30px] py-[21px] text-[18px] leading-[30px] text-ink-900 placeholder:text-ink-500 focus:outline-none"
              />
              <span
                data-fx="221:779"
                className="pointer-events-none absolute right-[35px] bottom-[19.5px] text-[18px] leading-[21px] text-ink-500"
              >
                {content.length}/2000
              </span>
            </div>
            {/* 불러오기 — 지난 일지를 가져와 다시 쓰는 자리. 목록에서 고르게 보낸다. */}
            <Link
              to={`/caregiver/journal/${elderId ?? ''}`}
              data-fx="235:231"
              className="absolute flex h-[57.04px] w-[138px] items-center rounded-[10px] border border-accent bg-white"
              style={{ left: COL, top: 714.77 }}
            >
              <img src={asset.iconUpload} alt="" className="absolute left-[24px] block" style={{ width: 16, height: 15.59 }} />
              <span className="absolute left-[48px] whitespace-nowrap text-[18px] leading-[21px] text-accent">
                불러오기
              </span>
            </Link>
          </>
        ) : null}

        {mode === 'voice' ? (
          <>
            <div
              data-fx="221:1038"
              className="absolute rounded-[10px] border border-line bg-white"
              style={{ left: COL, top: 363.5, width: 879, height: 231.18 }}
            >
              <p className="absolute left-[30px] top-[30.03px] whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900">
                음성 파일 올리기 (CLOVA 음성 인식)
              </p>
              <button
                type="button"
                data-fx="221:1045"
                onClick={() => voiceInput.current?.click()}
                className="absolute flex h-[52.04px] w-[179px] items-center rounded-[10px] border border-accent bg-white"
                style={{ left: 30, top: 78.06 }}
              >
                <img src={asset.iconUpload} alt="" className="absolute left-[26px] block" style={{ width: 16, height: 15.59 }} />
                <span className="absolute left-[50px] whitespace-nowrap text-[18px] leading-[21px] text-accent">
                  {voiceFile ? '다른 파일 선택' : '음성 파일 선택'}
                </span>
              </button>
              <input
                ref={voiceInput}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setVoiceFile(e.target.files?.[0] ?? null)}
              />
              <p
                data-fx="221:1040"
                className="absolute left-[30px] w-[674px] text-[18px] leading-[25px] text-ink-500"
                style={{ top: 145.11, wordBreak: 'keep-all' }}
              >
                {/* 실 STT 연동 전에는 인식 결과를 만들지 않는다 — 파일만 보관한다 */}
                {voiceFile
                  ? `${voiceFile.name} 을(를) 첨부했어요. 음성 인식 연동 전이라 아래 원문은 직접 적어 주세요.`
                  : '녹음한 음성 파일(mp3·m4a·wav 등)을 올리면 CLOVA 음성 인식으로 텍스트로 옮겨 아래 원문에 붙습니다. 인식 결과는 저장 전 꼭 확인해 주세요.'}
              </p>
            </div>
            <div
              data-fx="221:1041"
              className="absolute rounded-[10px] border border-line bg-white"
              style={{ left: COL, top: 615.7, width: 879, height: 68.05 }}
            >
              <input
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 2000))}
                aria-label="음성 인식 원문"
                placeholder="예: 점심 식사를 남김없이 드셨어요. 오후에 20분 산책하셨고 따님과 통화 후 기분이 밝으셨습니다."
                className="h-full w-full rounded-[10px] bg-transparent px-[30px] text-[18px] leading-[21px] text-ink-900 placeholder:text-ink-500 focus:outline-none"
              />
            </div>
          </>
        ) : null}

        {mode === 'photo' ? (
          <>
            {SLOT.xs.map((x, i) => {
              const file = photos[i];
              const src = previews[i];
              return (
                <button
                  key={x}
                  type="button"
                  data-fx={i === 0 ? '221:1245' : undefined}
                  onClick={() => photoInput.current?.click()}
                  className="absolute overflow-hidden rounded-[10px] border border-line bg-mute-pale"
                  style={{ left: x, top: SLOT.top, width: SLOT.w, height: SLOT.h }}
                >
                  {file ? (
                    <img src={src} alt={file.name} className="h-full w-full object-cover" />
                  ) : i === 0 ? (
                    <>
                      <img
                        src={asset.iconImage}
                        alt=""
                        className="absolute block"
                        style={{ left: 74, top: 64, width: 35.5, height: 35 }}
                      />
                      <span className="absolute inset-x-0 top-[110px] text-center text-w-body leading-[30px] text-ink-400">
                        사진 업로드
                      </span>
                    </>
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[32px] leading-[32px] text-ink-400">
                      +
                    </span>
                  )}
                </button>
              );
            })}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setPhotos((prev) => [...prev, ...picked].slice(0, SLOT.xs.length));
                e.target.value = '';
              }}
            />
            {/* 사진만으로는 일지 내용이 없다 — 설명을 적게 한다(빈 값 저장 금지) */}
            <input
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 2000))}
              aria-label="사진 설명"
              placeholder="사진에 대한 설명을 적어 주세요."
              className="absolute rounded-[10px] border border-line bg-white px-[30px] text-[18px] leading-[21px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none"
              style={{ left: COL, top: 578, width: 879, height: 57.04 }}
            />
          </>
        ) : null}

        {/* AI 초안 만들기 — 실 LLM 연동 전이라 아직 누를 수 없다(없는 초안을 만들지 않는다) */}
        <button
          type="button"
          disabled
          data-fx={mode === 'typed' ? '221:1031' : undefined}
          title="AI 초안은 실 연동 후 제공됩니다."
          className="absolute flex h-[57.04px] items-center rounded-[10px] border border-line bg-white disabled:cursor-not-allowed disabled:opacity-60"
          style={{ left: mode === 'typed' ? 253 : COL, top: mode === 'photo' ? 587.67 : 714.77, width: 195 }}
        >
          <img src={asset.iconSparkle} alt="" className="absolute left-[27px] block" style={{ width: 26.33, height: 26.34 }} />
          <span className="absolute left-[65px] whitespace-nowrap text-[18px] leading-[21px] text-ink-500">
            AI 초안 만들기
          </span>
        </button>
        <span
          className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-500"
          style={{ left: mode === 'typed' ? 471 : 305, top: mode === 'photo' ? 604.68 : 731.79 }}
        >
          작성한 일지를 AI가 인식하여 초안을 생성합니다.
        </span>

        <button
          type="button"
          data-fx="210:1881"
          disabled={saving}
          onClick={() => void save('draft')}
          className="absolute h-[57px] w-[140px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent disabled:opacity-60"
          style={{ left: 656, top: 813 }}
        >
          임시 저장
        </button>
        <button
          type="button"
          data-fx="210:1884"
          disabled={saving}
          onClick={() => void save('final')}
          className="absolute h-[57px] w-[140px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-60"
          style={{ left: 826, top: 813 }}
        >
          저장
        </button>
      </div>
    </div>
  );
}
