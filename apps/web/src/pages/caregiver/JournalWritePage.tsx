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
// ⚠️ 음성 인식은 Edge Function `stt-transcribe`(NCP CLOVA)를 부른다. **함수가 배포되지
//    않았거나 키가 없으면 분명한 오류를 보여 준다** — 조용히 빈 칸을 남기면 요양보호사는
//    "인식이 안 되는 음성"으로 오해하고 다시 녹음한다. 인식 결과는 원문 칸에 넣고
//    **사람이 확인·수정한 뒤** 저장한다(자동 저장 금지).
// ⚠️ AI 초안은 `@giokon/core` 의 `buildJournalDraft`(규칙 기반)다. 원문을 관찰 항목으로
//    묶어 줄 뿐 없는 내용을 만들지 않는다. 초안도 저장 전 사람이 확인한다.
// ⚠️ 사진은 `journal_photos`(20260822030000) 에 여러 장 저장한다. Storage 정책이 경로의
//    profile_id 로 기관을 확인하므로 경로는 `<profile_id>/…` 이고, **일지 행이 먼저** 있어야
//    첨부를 붙일 수 있다(저장 → 업로드 → 첨부 행 순서).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useAddJournalPhoto,
  useCareJournals,
  useCreateCareJournal,
  useCurrentUser,
  useJournalPhotos,
  useProfile,
  useUpdateCareJournal,
} from '@giokon/data';
import { buildJournalDraft } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import {
  removeJournalPhotoFiles,
  uploadJournalPhoto,
  useJournalPhotoUrls,
} from '../../lib/journalPhotos';
import { SttUnavailableError, transcribeAudio } from '../../lib/stt';
import { TimeField } from '../../components/ui/TimeField';
import { SessionJournalDialog } from '../../components/SessionJournalDialog';
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
// 사진 모드의 'AI 초안 만들기' 세로 위치 — 사진 설명칸(top 578, h 57.04) 아래 20px.
// 저장 버튼이 813 이라 버튼(57.04) 이 692.1 에서 끝나 겹치지 않는다.
const PHOTO_DRAFT_TOP = 578 + 57.04 + 20;

const FIELD = 'absolute rounded-[10px] border border-line bg-white text-[18px] leading-[21px] text-ink-500 focus:border-accent focus:outline-none';
const LABEL = 'absolute whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900';

/** 오늘 날짜(로컬) — `2026-07-30`. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function JournalWritePage() {
  const { elderId, journalId } = useParams<{ elderId: string; journalId: string }>();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);

  const modeParam = search.get('mode');
  const mode: Mode = modeParam === 'voice' || modeParam === 'photo' ? modeParam : 'typed';
  const setMode = (m: Mode) => setSearch(m === 'typed' ? {} : { mode: m }, { replace: true });

  const me = useCurrentUser();
  const createJournal = useCreateCareJournal();
  const updateJournal = useUpdateCareJournal();
  const addPhoto = useAddJournalPhoto();

  // 수정 모드 — 목록의 연필이 `/journal/:elderId/:journalId` 로 온다.
  const editing = Boolean(journalId);
  const journals = useCareJournals(editing ? elderId : undefined);
  const existing = useMemo(
    () => (journals.data ?? []).find((j) => j.id === journalId) ?? null,
    [journals.data, journalId],
  );
  const existingPhotos = useJournalPhotos(journalId);
  const existingUrls = useJournalPhotoUrls(
    (existingPhotos.data ?? []).map((p) => p.path),
    isConfigured,
  );
  const profile = useProfile(elderId);

  const [date, setDate] = useState(today());
  // ⚠️ 시각은 **비워 둔 채** 시작한다. 09:00~17:00 을 미리 채우면 관찰하지 않은 시각이
  //    기록으로 남는다(자리표시자 금지). 적은 만큼만 저장한다.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [content, setContent] = useState('');
  const [sessionDraftOpen, setSessionDraftOpen] = useState(false);
  const [generatedSource, setGeneratedSource] = useState(false);
  /** 아직 올리지 않은 사진(저장 시 일지 행을 만든 뒤 올린다). */
  const [photos, setPhotos] = useState<File[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const voiceInput = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  /** 수정 모드에서 이미 붙어 있는 사진(슬롯 앞자리를 차지한다). */
  const attached = useMemo(() => (editing ? (existingPhotos.data ?? []) : []), [editing, existingPhotos.data]);
  // 미리보기 URL 은 해제하지 않으면 파일이 메모리에 계속 남는다.
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // 수정 모드에서 서버 값을 한 번 심는다(사용자가 고치기 시작하면 덮지 않는다).
  const seeded = useRef(false);
  useEffect(() => {
    if (!existing || seeded.current) return;
    seeded.current = true;
    setDate(existing.journal_date);
    setFrom(existing.activity_from?.slice(0, 5) ?? '');
    setTo(existing.activity_to?.slice(0, 5) ?? '');
    setContent(existing.content);
    setGeneratedSource(existing.source === 'ai_draft');
  }, [existing]);

  /** 음성 파일 → 텍스트. 실패는 이유를 그대로 보여 준다(조용한 실패 금지). */
  async function runTranscribe(file: File) {
    if (!elderId) return;
    setVoiceFile(file);
    setTranscribing(true);
    try {
      const text = await transcribeAudio(file, elderId);
      // 이미 쓴 원문이 있으면 지우지 않고 이어 붙인다.
      setContent((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text).slice(0, 5000));
      toast('success', '음성을 텍스트로 옮겼어요. 저장 전 꼭 확인해 주세요.');
    } catch (e) {
      toast(
        'error',
        e instanceof SttUnavailableError || e instanceof Error
          ? e.message
          : '음성 인식에 실패했어요.',
      );
    } finally {
      setTranscribing(false);
    }
  }

  /** 원문을 관찰 항목으로 묶은 초안으로 바꾼다(사람이 확인·수정한 뒤 저장). */
  function makeDraft() {
    const raw = content.trim();
    if (!raw) return toast('error', '먼저 원문을 적거나 음성을 올려 주세요.');
    try {
      setContent(
        buildJournalDraft({
          elderName: profile.data?.name ?? '어르신',
          source: mode,
          rawText: raw,
          date,
        }).slice(0, 5000),
      );
      toast('success', '초안을 정리했어요. 확인·수정한 뒤 저장해 주세요.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '초안을 만들지 못했어요.');
    }
  }

  async function save(status: 'draft' | 'final') {
    if (!elderId) return;
    if (!isConfigured) return toast('error', 'Supabase 연동 후 저장할 수 있어요.');
    if (!content.trim()) return toast('error', '활동 내용을 입력해주세요.');
    // 한쪽만 적은 것은 허용한다(진행 중 기록). 뒤집힌 구간만 막는다.
    if (from && to && to < from) return toast('error', '종료 시각이 시작 시각보다 빠릅니다.');
    setSaving(true);
    // 업로드는 성공했는데 첨부 행이 실패하면 Storage 에 주인 없는 파일이 남는다 → 되돌린다.
    const uploaded: string[] = [];
    try {
      const fields: {
        journal_date: string;
        content: string;
        source: 'photo' | 'voice' | 'typed' | 'ai_draft';
        status: 'draft' | 'final';
        activity_from: string | null;
        activity_to: string | null;
      } = {
        journal_date: date,
        content: content.trim(),
        source: generatedSource ? 'ai_draft' : mode === 'photo' ? 'photo' : mode === 'voice' ? 'voice' : 'typed',
        status,
        // 적지 않았으면 null 이다 — 09:00 같은 기본값을 채우지 않는다.
        activity_from: from || null,
        activity_to: to || null,
      };
      const row = editing && journalId
        ? await updateJournal.mutateAsync({ id: journalId, patch: fields })
        : await createJournal.mutateAsync({
            ...fields,
            profile_id: elderId,
            author_id: me.data?.id ?? null,
          });
      // 일지 행이 생긴 뒤에야 Storage 정책을 통과한다 → 저장 → 업로드 → 첨부 행 순서.
      const base = editing ? (existingPhotos.data ?? []).length : 0;
      for (const [i, file] of photos.entries()) {
        const path = await uploadJournalPhoto(elderId, file);
        uploaded.push(path);
        await addPhoto.mutateAsync({ journal_id: row.id, path, sort: base + i });
      }
      toast(
        'success',
        editing
          ? '요양일지를 수정했어요.'
          : status === 'final'
            ? '요양일지를 저장했어요.'
            : '임시 저장했어요.',
      );
      navigate(`/caregiver/journal/${elderId}`);
    } catch (e) {
      // 붙지 못한 파일은 지운다(정리에 실패해도 원래 오류를 덮지 않는다).
      if (uploaded.length) await removeJournalPhotoFiles(uploaded).catch(() => {});
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
        {editing ? '요양일지 수정' : '새 요양일지 작성'}
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
          {/* `date-native-hidden` = 브라우저 기본 달력 아이콘을 투명하게 만들어 칸 전체로
              늘린다 — 시안 아이콘과 두 개로 보이던 것을 하나로(2026-09-11 사용자 신고). */}
          <input
            id="jw-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="date-native-hidden h-full w-full rounded-[10px] bg-transparent pl-[29px] pr-[40px] text-[18px] leading-[21px] text-ink-500 focus:outline-none"
          />
          <img
            src={asset.iconCalendarSm}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute left-[169px] top-1/2 block -translate-y-1/2"
          />
        </div>

        {/* 활동 시간 */}
        <span data-fx="221:699" className={LABEL} style={{ left: 345, top: 106.31 }}>
          활동 시간
        </span>
        <TimeField
          data-fx="221:700"
          label="활동 시작 시각"
          value={from}
          onChange={setFrom}
          className={cn(FIELD, 'h-[57.04px] w-[145px]')}
          style={{ left: 345, top: 142.33 }}
        />
        <span className="absolute text-w-body leading-[24px] text-ink-900" style={{ left: 512, top: 157.35 }}>
          ~
        </span>
        <TimeField
          data-fx="221:710"
          label="활동 종료 시각"
          value={to}
          onChange={setTo}
          className={cn(FIELD, 'h-[57.04px] w-[145px]')}
          style={{ left: 548, top: 142.33 }}
        />

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
            className="pointer-events-none absolute top-1/2 block -translate-y-1/2"
            style={{ left: 188.13, width: 19.29, height: 13.02 }}
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
                onChange={(e) => setContent(e.target.value.slice(0, 5000))}
                aria-label="오늘 어르신의 활동"
                placeholder="오늘 어르신의 활동을 입력해주세요."
                className="h-full w-full resize-none rounded-[10px] bg-transparent px-[30px] py-[21px] text-[18px] leading-[30px] text-ink-900 placeholder:text-ink-500 focus:outline-none"
              />
              <span
                data-fx="221:779"
                className="pointer-events-none absolute right-[35px] bottom-[19.5px] text-[18px] leading-[21px] text-ink-500"
              >
                {content.length}/5000
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
                disabled={transcribing}
                onClick={() => voiceInput.current?.click()}
                className="absolute flex h-[52.04px] w-[179px] items-center rounded-[10px] border border-accent bg-white"
                style={{ left: 30, top: 78.06 }}
              >
                <img src={asset.iconUpload} alt="" className="absolute left-[26px] block" style={{ width: 16, height: 15.59 }} />
                <span className="absolute left-[50px] whitespace-nowrap text-[18px] leading-[21px] text-accent">
                  {transcribing ? '인식 중...' : voiceFile ? '다른 파일 선택' : '음성 파일 선택'}
                </span>
              </button>
              <input
                ref={voiceInput}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void runTranscribe(f);
                }}
              />
              <p
                data-fx="221:1040"
                className="absolute left-[30px] w-[674px] text-[18px] leading-[25px] text-ink-500"
                style={{ top: 145.11, wordBreak: 'keep-all' }}
              >
                {/* 인식 결과를 만들어 내지 않는다 — 실패하면 이유를 토스트로 알린다 */}
                {transcribing
                  ? `${voiceFile?.name ?? '음성'} 을(를) 인식하고 있어요...`
                  : voiceFile
                    ? `${voiceFile.name} 을(를) 올렸어요. 아래 원문을 확인·수정한 뒤 저장해 주세요.`
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
                onChange={(e) => setContent(e.target.value.slice(0, 5000))}
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
              // 수정 모드에서는 이미 붙은 사진이 먼저 온다 — 안 보이면 지운 줄 알고 다시 올린다.
              const kept = attached[i];
              const file = kept ? undefined : photos[i - attached.length];
              const src = kept
                ? existingUrls.data?.[kept.path]
                : previews[i - attached.length];
              return (
                <button
                  key={x}
                  type="button"
                  data-fx={i === 0 ? '221:1245' : undefined}
                  onClick={() => photoInput.current?.click()}
                  className="absolute overflow-hidden rounded-[10px] border border-line bg-mute-pale"
                  style={{ left: x, top: SLOT.top, width: SLOT.w, height: SLOT.h }}
                >
                  {kept || file ? (
                    <img
                      src={src}
                      alt={kept ? (kept.caption ?? '첨부된 사진') : (file?.name ?? '')}
                      className="h-full w-full object-cover"
                    />
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
            {/* 사진만으로는 일지 내용이 없다 — 설명을 적게 한다(빈 값 저장 금지).
                ⚠️ 아래 'AI 초안 만들기' 버튼과 **세로로 겹쳐 있었다**(설명 578~635.0 ↔
                버튼 587.7~644.7, 2026-09-11 사용자 신고) → 버튼을 설명 아래로 내렸다
                (PHOTO_DRAFT_TOP). 사진 슬롯은 363+193=556 에서 끝난다. */}
            <input
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 5000))}
              aria-label="사진 설명"
              placeholder="사진에 대한 설명을 적어 주세요."
              className="absolute rounded-[10px] border border-line bg-white px-[30px] text-[18px] leading-[21px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none"
              style={{ left: COL, top: 578, width: 879, height: 57.04 }}
            />
          </>
        ) : null}

        {/* AI 초안 만들기 — 원문을 관찰 항목으로 묶는다(core buildJournalDraft, 규칙 기반).
            없는 내용을 만들지 않는다. 원문이 비어 있으면 누를 것이 없어 잠근다. */}
        <button
          type="button"
          disabled={!content.trim() || saving}
          onClick={makeDraft}
          data-fx={mode === 'typed' ? '221:1031' : undefined}
          title={content.trim() ? '원문을 관찰 항목으로 정리합니다' : '먼저 원문을 적어 주세요'}
          className="absolute flex h-[57.04px] items-center rounded-[10px] border border-line bg-white disabled:cursor-not-allowed disabled:opacity-60"
          style={{ left: mode === 'typed' ? 253 : COL, top: mode === 'photo' ? PHOTO_DRAFT_TOP : 714.77, width: 195 }}
        >
          <img src={asset.iconSparkle} alt="" className="absolute left-[27px] block" style={{ width: 26.33, height: 26.34 }} />
          <span className="absolute left-[65px] whitespace-nowrap text-[18px] leading-[21px] text-ink-500">
            AI 초안 만들기
          </span>
        </button>
        <span
          className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-500"
          style={{ left: mode === 'typed' ? 471 : 305, top: mode === 'photo' ? PHOTO_DRAFT_TOP + 17.01 : 731.79 }}
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
        <button type="button" disabled={saving || !isConfigured} onClick={() => setSessionDraftOpen(true)} className="absolute h-[57px] rounded-[10px] border border-accent bg-white px-5 text-w-sub font-semibold text-accent disabled:opacity-50" style={{ left: COL, top: 813 }}>
          회상 대화에서 일지 초안
        </button>
      </div>
      {sessionDraftOpen && elderId ? <SessionJournalDialog key={elderId} elderId={elderId} hasContent={Boolean(content.trim())} onClose={() => setSessionDraftOpen(false)} onApply={text => { setContent(text); setGeneratedSource(true); setMode('typed'); setSessionDraftOpen(false); }} /> : null}
    </div>
  );
}
