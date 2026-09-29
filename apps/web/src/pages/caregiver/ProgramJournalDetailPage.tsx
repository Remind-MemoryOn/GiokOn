import { Select as StyledSelect } from '../../components/ui/Select';
// 프로그램 일지 상세·작성 (파일럿 W1 · SCR-W16 — Figma 시안 없음)
//
// 시안이 없는 화면이라 기존 요양일지 작성(221:283) 체계를 그대로 쓴다(계획 §7 디자인 결정 2026-09-24):
//   제목 @169 · 부제 @236.18 · 돌아가기 @(1285,197.15) · 카드 1057 @(322,295) r10 shadow-card ·
//   카드 안 왼쪽 87 · 라벨 SemiBold 20/24 · 입력 h57.04 r10 1px line 글자 18 · 저장 140×57.
//   칸이 12개라 좌표 고정 대신 카드 안은 흐름 배치(2열 427 + 간격 25 = 879)다.
//
// ⚠️ 초안은 대화가 끝나면 서버가 자동으로 만든다(사용자 확정 2026-09-25) — **"초안 생성" 버튼을 두지 않는다.**
//    "다시 생성"은 `failed` 일지에만 보이는 복구 버튼이다(retry_journal_generation — 수동 초안 함수를 다시 부르지 않는다).
// ⚠️ 규칙은 서버 트리거가 집행한다 — 화면은 버튼을 켜고 끄고 읽을 수 있는 말로 바꿀 뿐이다:
//    확정 = 사람 + 위임 권한(journal_finalize) + 진행자 + (제공한 날) 진행 내용 · 확정은 되돌릴 수 없다 ·
//    확정 뒤 공단 칸을 고치면 수정 사유 필수(이력으로 남는다) · 보호자 문장 승인자·시각은 서버가 채운다.
// ⚠️ 워커가 도는 동안(generating)에도 고칠 수 있다 — 워커는 사람이 먼저 쓴 칸을 덮어쓰지 않는다.
//    그래서 **바꾼 칸만** 보낸다(열어 본 뒤 워커가 채운 칸을 빈 값으로 지우지 않게).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useAddProgramJournalPhoto,
  useCreateProgramJournal,
  useCurrentUser,
  useHasCapability,
  useJournalRevisions,
  useOrgMembers,
  useOrgSettings,
  useProfile,
  useProgramJournalPhotos,
  useProgramJournals,
  useRetryJournalGeneration,
  useUpdateProgramJournal,
  JOURNAL_VERSION_CONFLICT,
  type JournalNonDeliveryReason,
  type ProgramJournalRevisionRow,
  type ProgramJournalRow,
  type ProgramJournalUpdate,
  type UserRow,
} from '@giokon/data';
import { dateDot } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { Y } from '../../lib/figmaY';
import { removeJournalPhotoFiles, uploadJournalPhoto, useJournalPhotoUrls } from '../../lib/journalPhotos';
import { journalErrorMessage } from '../../lib/journalErrors';
import {
  AI_DRAFT_FIELDS,
  JOURNAL_FIELD_LABEL,
  NON_DELIVERY_LABEL,
  journalTitle,
} from '../../lib/programJournal';
import { TimeField } from '../../components/ui/TimeField';
import { JournalStatusChip } from '../../components/JournalStatusChip';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';

const CARD_TOP = 295;
/** 사진 슬롯 — 작성 화면(221:1196)과 같은 187×193 · 피치 231 · 4칸. */
const SLOT = { w: 187, h: 193, count: 4 };

const INPUT =
  'h-[57.04px] w-full rounded-[10px] border border-line bg-white px-[29px] text-[18px] leading-[21px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none disabled:bg-mute-pale disabled:text-ink-500';
const AREA =
  'block w-full resize-y rounded-[10px] border border-line bg-white px-[29px] py-[18px] text-[18px] leading-[30px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none disabled:bg-mute-pale disabled:text-ink-500';
const SECTION = 'text-w-nav font-bold leading-[30px] text-ink-900';

/** 폼 값 — 문자열 칸은 빈 문자열이 "적지 않음"(저장 시 null). */
interface Form {
  journal_date: string;
  operated_from: string;
  operated_to: string;
  program_type: string;
  location: string;
  facilitator_user_id: string;
  participants: string;
  goal: string;
  activity_content: string;
  participant_response: string;
  opinion_collected: string;
  overall_evaluation: string;
  next_plan: string;
  tool_used: string;
  delivered: boolean;
  non_delivery_reason: '' | JournalNonDeliveryReason;
  guardian_text: string;
}
type TextKey = Exclude<keyof Form, 'delivered' | 'non_delivery_reason'>;

/** 서버 이력이 추적하는 공단 칸 — 확정 뒤 이 칸이 바뀌면 수정 사유가 필요하다(보호자 문장은 아니다). */
const TRACKED = Object.keys(JOURNAL_FIELD_LABEL) as (keyof Form)[];

/** 긴 글 칸 — 한도는 DB 제약과 같다. */
const LONG_FIELDS: { key: TextKey; max: number; placeholder: string }[] = [
  { key: 'goal', max: 2000, placeholder: '이번 프로그램의 목표를 적어 주세요.' },
  { key: 'activity_content', max: 5000, placeholder: '프로그램에서 진행한 내용을 적어 주세요.' },
  { key: 'participant_response', max: 2000, placeholder: '어르신의 반응과 특이사항을 적어 주세요.' },
  { key: 'opinion_collected', max: 2000, placeholder: '어르신께 들은 의견을 적어 주세요.' },
  { key: 'overall_evaluation', max: 2000, placeholder: '전반적인 평가를 적어 주세요.' },
  { key: 'next_plan', max: 2000, placeholder: '다음 프로그램 계획을 적어 주세요.' },
];

/** 오늘 날짜(로컬) — `2026-07-30`. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromRow(j: ProgramJournalRow): Form {
  return {
    journal_date: j.journal_date,
    operated_from: j.operated_from?.slice(0, 5) ?? '',
    operated_to: j.operated_to?.slice(0, 5) ?? '',
    program_type: j.program_type,
    location: j.location ?? '',
    facilitator_user_id: j.facilitator_user_id ?? '',
    participants: j.participants ?? '',
    goal: j.goal ?? '',
    activity_content: j.activity_content ?? '',
    participant_response: j.participant_response ?? '',
    opinion_collected: j.opinion_collected ?? '',
    overall_evaluation: j.overall_evaluation ?? '',
    next_plan: j.next_plan ?? '',
    tool_used: j.tool_used ?? '',
    delivered: j.delivered,
    non_delivery_reason: j.non_delivery_reason ?? '',
    guardian_text: j.guardian_text ?? '',
  };
}

/**
 * 수기 작성의 시작값 — **기관 설정값만** 채운다(기본 프로그램 유형·장소)와 진행자 = 본인.
 * 시각·내용은 비워 둔다(관찰하지 않은 값을 기록으로 남기지 않는다).
 */
function blankForm(settings: { default_program_type: string; default_location: string | null } | null | undefined, meId: string | undefined): Form {
  return {
    journal_date: today(),
    operated_from: '',
    operated_to: '',
    program_type: settings?.default_program_type ?? '인지활동 - 회상훈련',
    location: settings?.default_location ?? '',
    facilitator_user_id: meId ?? '',
    participants: '',
    goal: '',
    activity_content: '',
    participant_response: '',
    opinion_collected: '',
    overall_evaluation: '',
    next_plan: '',
    tool_used: '',
    delivered: true,
    non_delivery_reason: '',
    guardian_text: '',
  };
}

/** 폼 값 → 저장 값(빈 칸 null · 앞뒤 공백 제거). */
function toColumns(f: Form): Required<Pick<ProgramJournalUpdate, keyof Form>> {
  const t = (v: string) => v.trim() || null;
  return {
    journal_date: f.journal_date,
    operated_from: f.operated_from || null,
    operated_to: f.operated_to || null,
    program_type: f.program_type.trim(),
    location: t(f.location),
    facilitator_user_id: f.facilitator_user_id || null,
    participants: t(f.participants),
    goal: t(f.goal),
    activity_content: t(f.activity_content),
    participant_response: t(f.participant_response),
    opinion_collected: t(f.opinion_collected),
    overall_evaluation: t(f.overall_evaluation),
    next_plan: t(f.next_plan),
    tool_used: t(f.tool_used),
    delivered: f.delivered,
    non_delivery_reason: f.delivered ? null : f.non_delivery_reason || null,
    guardian_text: t(f.guardian_text),
  } as Required<Pick<ProgramJournalUpdate, keyof Form>>;
}

/** `2026.09.26 14:03` — 이력·확정 표기. */
function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dateDot(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 라벨 + 입력 한 칸. */
function Field({ label, htmlFor, badge, hint, wide, children }: {
  label: string; htmlFor?: string; badge?: ReactNode; hint?: ReactNode; wide?: boolean; children: ReactNode;
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <div className="mb-[12px] flex min-h-[32px] items-center gap-[10px]">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-w-body font-semibold leading-[24px] text-ink-900">{label}</label>
        ) : (
          <span className="text-w-body font-semibold leading-[24px] text-ink-900">{label}</span>
        )}
        {badge}
      </div>
      {children}
      {hint ? <p className="mt-[8px] text-[16px] leading-[24px] text-ink-500" style={{ wordBreak: 'keep-all' }}>{hint}</p> : null}
    </div>
  );
}

/** 드롭다운 — 입력 칸과 같은 틀 + 시안의 큰 꺾쇠(221:680). */
function Select({ id, value, onChange, disabled, children, label }: {
  id: string; value: string; onChange: (v: string) => void; disabled?: boolean; children: ReactNode; label?: string;
}) {
  return (
    <div className="relative">
      <StyledSelect
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT, 'cursor-pointer appearance-none pr-[56px] disabled:cursor-not-allowed')}
      >
        {children}
      </StyledSelect>
      <img
        src={asset.iconChevronDownLg}
        alt=""
        className="pointer-events-none absolute right-[27px] top-1/2 block -translate-y-1/2"
        style={{ width: 19.29, height: 13.02 }}
      />
    </div>
  );
}

/** 새 일지를 만든 뒤 사진 일부가 실패하면 그 일지의 편집 화면으로 옮기면서 **아직 붙지 않은 사진**을 넘긴다(T25.2). */
type JournalNavState = { pendingPhotos?: File[] } | null;

/** 일지 ID 가 바뀌면(새 일지 → 만들어진 일지) 폼을 새로 심는다 — 손댄 표시·비교 기준이 다른 일지로 넘어가지 않게. */
export function ProgramJournalDetailPage() {
  const { journalId } = useParams<{ journalId: string }>();
  return <ProgramJournalDetailForm key={journalId ?? 'new'} />;
}

function ProgramJournalDetailForm() {
  const { elderId, journalId } = useParams<{ elderId: string; journalId: string }>();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);

  const me = useCurrentUser();
  const members = useOrgMembers();
  const settings = useOrgSettings({ enabled: isConfigured });
  const profile = useProfile(elderId);
  const canFinalize = useHasCapability('journal_finalize', { enabled: isConfigured });
  const createJournal = useCreateProgramJournal();
  const updateJournal = useUpdateProgramJournal();
  const retry = useRetryJournalGeneration();
  const addPhoto = useAddProgramJournalPhoto();

  const editing = Boolean(journalId);
  const journals = useProgramJournals(editing ? elderId : undefined);
  const existing = useMemo(
    () => (journals.data ?? []).find((j) => j.id === journalId) ?? null,
    [journals.data, journalId],
  );
  const revisions = useJournalRevisions(editing ? journalId : undefined);
  const existingPhotos = useProgramJournalPhotos(journalId);
  const attached = useMemo(() => (editing ? (existingPhotos.data ?? []) : []), [editing, existingPhotos.data]);
  const attachedUrls = useJournalPhotoUrls(attached.map((p) => p.path), isConfigured);

  // ── 폼 — 서버 값(또는 수기 시작값)을 심고, 손대기 전이면 서버가 바뀔 때(워커 완료·다른 사람 저장) 다시 심는다.
  const baseline = useMemo(
    () => (existing ? fromRow(existing) : blankForm(settings.data, me.data?.id)),
    [existing, settings.data, me.data?.id],
  );
  const baselineApproved = Boolean(existing?.guardian_text_approved_at);
  const baselineKey = `${JSON.stringify(baseline)}|${baselineApproved}`;
  const [form, setForm] = useState<Form>(baseline);
  const [approve, setApprove] = useState(baselineApproved);
  /** 폼을 심은 그때의 서버 값 — "바꾼 칸"의 비교 기준. 손댄 뒤 서버가 바뀌어도(워커 완료) 이 값은 그대로라
   *  사용자가 건드리지 않은 칸을 옛 값(빈 값)으로 보내 워커가 채운 내용을 지우지 않는다. */
  const [seed, setSeed] = useState({ form: baseline, approved: baselineApproved, updatedAt: existing?.updated_at });
  /** 저장·승인·확정이 버전 충돌로 거절됐다(T25.3) — 최신 내용을 불러와 다시 확인하게 한다. */
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reason, setReason] = useState('');
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setForm(baseline);
    setApprove(baselineApproved);
    setSeed({ form: baseline, approved: baselineApproved, updatedAt: existing?.updated_at });
    // baselineKey 가 baseline·baselineApproved 를 대표한다(객체 동일성으로 다시 심지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineKey]);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    touched.current = true;
    setForm((f) => ({ ...f, [key]: value }));
  };

  /** 아직 올리지 않은 사진(저장 시 일지 행을 만든 뒤 올린다). */
  const [photos, setPhotos] = useState<File[]>(() => (location.state as JournalNavState)?.pendingPhotos ?? []);
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  // 미리보기 URL 은 해제하지 않으면 파일이 메모리에 계속 남는다.
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const photoInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const status = existing?.status ?? null;
  const isFinal = status === 'final';
  const mayFinalize = canFinalize.data === true;
  /** 확정 뒤 공단 칸은 확정 권한이 있어야 고친다(서버 JOURNAL_EDIT_FORBIDDEN) — 없으면 읽기 전용. */
  const trackedLocked = isFinal && !mayFinalize;
  const aiDraft = Boolean(existing?.draft_generated_at) && !isFinal;

  const before = toColumns(seed.form);
  const seededApproved = seed.approved;
  const after = toColumns(form);
  const changedTracked = TRACKED.filter((k) => after[k] !== before[k]);
  const guardianChanged = after.guardian_text !== before.guardian_text;
  const dirty = changedTracked.length > 0 || guardianChanged || approve !== seededApproved || photos.length > 0;

  const tab = editing && search.get('tab') === 'history' ? 'history' : 'form';
  const memberName = (id: string | null | undefined) =>
    id ? ((members.data ?? []).find((m) => m.id === id)?.name ?? '기관을 떠난 직원') : '—';
  const facilitators = useMemo(
    () => (members.data ?? []).filter((m: UserRow) => m.role !== 'guardian'),
    [members.data],
  );

  async function save(intent: 'save' | 'finalize') {
    if (!elderId) return;
    if (!isConfigured) return toast('error', 'Supabase 연동 후 저장할 수 있어요.');
    if (!after.program_type) return toast('error', '프로그램 유형을 입력해 주세요.');
    // 한쪽만 적은 것은 허용한다(진행 중 기록). 뒤집힌 구간만 막는다.
    if (after.operated_from && after.operated_to && after.operated_to < after.operated_from) {
      return toast('error', '종료 시각이 시작 시각보다 빨라요.');
    }
    if (!form.delivered && !form.non_delivery_reason) return toast('error', '미제공 사유를 골라 주세요.');
    if (approve && !after.guardian_text) return toast('error', '보호자 문장을 먼저 입력해 주세요.');
    const finalizing = intent === 'finalize' && !isFinal;
    if (finalizing) {
      if (!after.facilitator_user_id) return toast('error', '진행한 요양보호사를 골라 주세요.');
      if (form.delivered && !after.activity_content) return toast('error', '진행 내용을 입력해 주세요.');
    }
    if (isFinal && changedTracked.length > 0 && !reason.trim()) {
      return toast('error', '확정된 일지를 고치려면 수정 사유를 적어 주세요.');
    }

    // 바꾼 칸만 보낸다(새 일지는 전부).
    const patch: ProgramJournalUpdate = {};
    for (const k of [...TRACKED, 'guardian_text'] as (keyof Form)[]) {
      if (!existing || after[k] !== before[k]) Object.assign(patch, { [k]: after[k] });
    }
    // 보호자 문장 승인 — 시각은 서버가 호출자·지금으로 바꿔 적는다(보낸 값은 "승인 요청" 표시일 뿐).
    if (approve && (!seededApproved || guardianChanged)) patch.guardian_text_approved_at = new Date().toISOString();
    else if (!approve && seededApproved) patch.guardian_text_approved_at = null;
    // 상태: 확정 요청 · 실패한 일지를 사람이 이어 쓰면 확인 대기 · 생성 중은 그대로(워커가 이어서 채운다).
    if (finalizing) patch.status = 'final';
    else if (!existing || status === 'failed') patch.status = 'pending_review';
    if (isFinal && changedTracked.length > 0) patch.edit_reason = reason.trim();

    setSaving(true);
    // 저장 → 업로드 → 첨부 행 순서(일지 행이 있어야 첨부 행 정책을 통과한다).
    // ⚠️ 부분 실패(T25.2): 이미 붙은 사진은 그대로 두고, **붙지 못한 그 파일만** 지운다.
    //    새 일지는 만들어진 뒤라면 그 일지로 옮겨 이어서 저장하게 한다(다시 저장해도 일지가 둘이 되지 않게).
    let row: ProgramJournalRow | null = null;
    const pending = [...photos];
    try {
      row =
        existing && journalId
          ? Object.keys(patch).length > 0
            ? await updateJournal.mutateAsync({ id: journalId, patch, expectedUpdatedAt: seed.updatedAt })
            : existing
          : await createJournal.mutateAsync({
              ...(patch as Required<typeof after>),
              status: finalizing ? 'final' : 'pending_review',
              profile_id: elderId,
            });
      let sort = attached.length;
      while (pending.length > 0) {
        const path = await uploadJournalPhoto(elderId, pending[0]);
        try {
          await addPhoto.mutateAsync({ journal_id: row.id, path, sort });
        } catch (e) {
          // 이 파일만 주인이 없다 — 지운다(정리 실패가 원래 오류를 덮지 않게).
          await removeJournalPhotoFiles([path]).catch(() => {});
          throw e;
        }
        pending.shift();
        sort += 1;
      }
      toast(
        'success',
        finalizing
          ? '일지를 확정했어요.'
          : isFinal && changedTracked.length > 0
            ? '수정 내용을 저장했어요. 수정 이력에 남았어요.'
            : '일지를 저장했어요.',
      );
      navigate(`/caregiver/journal/${elderId}`);
    } catch (e) {
      if (!row && e instanceof Error && e.message === JOURNAL_VERSION_CONFLICT) {
        // 화면이 읽은 뒤 다른 곳(워커·다른 직원)에서 일지가 바뀌었다 — 보지 않은 내용을 승인·확정하지 않는다.
        setConflict(true);
        toast('error', '다른 곳에서 이 일지가 바뀌었어요. 최신 내용을 불러와 확인한 뒤 다시 저장해 주세요.');
      } else if (!row) {
        toast('error', journalErrorMessage(e));
      } else {
        // 일지는 저장됐고 사진 일부만 못 붙였다 — 남은 사진만 다시 올리면 된다.
        toast('error', `일지는 저장했어요. 사진 ${pending.length}장을 붙이지 못했어요 — 다시 저장하면 남은 사진만 올려요.`);
        if (!existing) {
          const state: JournalNavState = { pendingPhotos: pending };
          navigate(`/caregiver/journal/${elderId}/${row.id}`, { replace: true, state });
        } else {
          setPhotos(pending);
          // 저장된 값으로 폼을 다시 심게 한다(같은 칸을 "바뀐 칸"으로 또 보내지 않게).
          touched.current = false;
        }
      }
    } finally {
      setSaving(false);
    }
  }

  /** 최신 일지를 불러와 폼에 다시 심는다 — **내가 바꾼 칸은 유지**하고 나머지는 서버 값으로.
   *  보호자 문장 승인은 새 문장을 보고 다시 체크하게 서버 상태로 되돌린다(내가 문장을 고쳤으면 해제). */
  async function reloadLatest() {
    setReloading(true);
    try {
      const fresh = await journals.refetch();
      const row = (fresh.data ?? []).find((j) => j.id === journalId);
      if (!row) return toast('error', '일지를 다시 불러오지 못했어요.');
      const latest = fromRow(row);
      const merged = { ...latest };
      for (const k of Object.keys(latest) as (keyof Form)[]) {
        if (form[k] !== seed.form[k]) Object.assign(merged, { [k]: form[k] });
      }
      const latestApproved = Boolean(row.guardian_text_approved_at);
      setForm(merged);
      setApprove(latestApproved && merged.guardian_text === latest.guardian_text);
      setSeed({ form: latest, approved: latestApproved, updatedAt: row.updated_at });
      setConflict(false);
    } finally {
      setReloading(false);
    }
  }

  function regenerate() {
    if (!existing || !elderId) return;
    retry.mutate(
      { id: existing.id, profileId: elderId },
      {
        onSuccess: () => toast('success', '초안을 다시 만들고 있어요. 끝나면 확인 대기로 바뀌어요.'),
        onError: (e) => toast('error', journalErrorMessage(e, '다시 생성하지 못했어요.')),
      },
    );
  }

  const aiBadge = aiDraft ? (
    <Badge tone="info" className="!text-ink-900">
      AI 초안
    </Badge>
  ) : null;
  /** 워커가 채우는 칸인데 비어 있으면 — 워커가 걸러 비웠거나 근거가 없었다. 사람이 채운다. */
  const aiEmptyHint = (key: (typeof AI_DRAFT_FIELDS)[number]) =>
    aiDraft && !form[key].trim() ? 'AI가 채우지 않은 칸이에요. 직접 적어 주세요.' : undefined;

  const title = editing ? (existing ? journalTitle(existing.journal_date) : '프로그램 일지') : '새 프로그램 일지';
  const elderName = profile.data?.name;
  const notFound = editing && journals.isSuccess && !existing;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다(헤더만 절대 배치, 카드는 흐름).
    <div className="relative -ml-[323px] w-[1440px] pb-[87px]">
      <h1
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        {elderName ? `${elderName} 어르신의 ${title}` : title}
      </h1>
      <p
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.18) }}
      >
        대화가 끝나면 AI가 초안을 만들어요. 내용을 확인·수정한 뒤 확정해 주세요.
      </p>
      <Link
        to={`/caregiver/journal/${elderId ?? ''}`}
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(197.15) }}
      >
        <img src={asset.iconChevronRightSm} alt="" className="block rotate-180" style={{ width: 12.18, height: 18.73 }} />
        돌아가기
      </Link>

      <div
        className="relative ml-[322px] w-[1057px] rounded-[10px] bg-white px-[87px] pb-[64px] pt-[27px] shadow-card"
        style={{ marginTop: Y(CARD_TOP) }}
      >
        {editing && !existing ? (
          <p className="py-[60px] text-center text-w-body leading-[30px] text-ink-500">
            {notFound ? '일지를 찾을 수 없어요. 목록에서 다시 골라 주세요.' : '일지를 불러오고 있어요.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-[12px]">
              <h2 className="whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900">
                {existing ? '공단 서식' : '새 일지'}
              </h2>
              {status ? <JournalStatusChip status={status} size="sm" /> : null}
              {aiDraft ? (
                <Badge tone="info" large className="!text-ink-900">
                  AI 초안
                </Badge>
              ) : null}
            </div>

            {editing ? (
              <div role="tablist" aria-label="일지 보기" className="mt-[8px] flex gap-[48px] border-b border-line">
                {(['form', 'history'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setSearch(key === 'form' ? {} : { tab: 'history' }, { replace: true })}
                    className={cn(
                      '-mb-px border-b-[3px] pb-[10px] text-w-nav leading-[30px]',
                      tab === key ? 'border-accent font-semibold text-accent' : 'border-transparent text-ink-500',
                    )}
                  >
                    {key === 'form' ? '일지 내용' : `수정 이력${revisions.data?.length ? ` ${revisions.data.length}` : ''}`}
                  </button>
                ))}
              </div>
            ) : null}

            {tab === 'history' && existing ? (
              <History journal={existing} revisions={revisions.data} loading={revisions.isLoading} memberName={memberName} />
            ) : (
              <>
                <StatusNotice
                  journal={existing}
                  mayFinalize={mayFinalize}
                  memberName={memberName}
                  retrying={retry.isPending}
                  onRetry={regenerate}
                />

                <div className="mt-[32px] grid grid-cols-2 gap-x-[25px] gap-y-[28px]">
                  <Field label={JOURNAL_FIELD_LABEL.journal_date} htmlFor="pj-date">
                    <div className="relative w-[219px]">
                      {/* `date-native-hidden` = 브라우저 달력 아이콘을 투명하게 칸 전체로 — 시안 아이콘 하나만 보인다. */}
                      <input
                        id="pj-date"
                        type="date"
                        value={form.journal_date}
                        disabled={trackedLocked || saving}
                        onChange={(e) => set('journal_date', e.target.value)}
                        className={cn(INPUT, 'date-native-hidden pr-[40px]')}
                      />
                      <img
                        src={asset.iconCalendarSm}
                        alt=""
                        width={22}
                        height={22}
                        className="pointer-events-none absolute left-[169px] top-1/2 block -translate-y-1/2"
                      />
                    </div>
                  </Field>
                  <Field label="운영 시간">
                    <div className="flex items-center gap-[20px]">
                      <TimeField
                        label="운영 시작 시각"
                        value={form.operated_from}
                        onChange={(v) => set('operated_from', v)}
                        disabled={trackedLocked || saving}
                        className={cn('relative h-[57.04px] w-[145px] rounded-[10px] border border-line bg-white', trackedLocked && 'bg-mute-pale')}
                      />
                      <span className="text-w-body leading-[24px] text-ink-900">~</span>
                      <TimeField
                        label="운영 종료 시각"
                        value={form.operated_to}
                        onChange={(v) => set('operated_to', v)}
                        disabled={trackedLocked || saving}
                        className={cn('relative h-[57.04px] w-[145px] rounded-[10px] border border-line bg-white', trackedLocked && 'bg-mute-pale')}
                      />
                    </div>
                  </Field>

                  <Field label={JOURNAL_FIELD_LABEL.program_type} htmlFor="pj-type">
                    <input id="pj-type" className={INPUT} maxLength={60} value={form.program_type} disabled={trackedLocked || saving}
                      onChange={(e) => set('program_type', e.target.value)} />
                  </Field>
                  <Field label={JOURNAL_FIELD_LABEL.location} htmlFor="pj-location">
                    <input id="pj-location" className={INPUT} maxLength={60} value={form.location} disabled={trackedLocked || saving}
                      placeholder="예: 2층 프로그램실" onChange={(e) => set('location', e.target.value)} />
                  </Field>

                  <Field label={JOURNAL_FIELD_LABEL.facilitator_user_id} htmlFor="pj-facilitator" hint="진행자는 프로그램을 진행·감독한 직원이에요. AI는 진행자가 될 수 없어요.">
                    <Select id="pj-facilitator" value={form.facilitator_user_id} disabled={trackedLocked || saving}
                      onChange={(v) => set('facilitator_user_id', v)}>
                      <option value="">진행자를 골라 주세요</option>
                      {facilitators.map((m) => (
                        <option key={m.id} value={m.id}>{m.name ?? '이름 없음'}</option>
                      ))}
                      {form.facilitator_user_id && !facilitators.some((m) => m.id === form.facilitator_user_id) ? (
                        <option value={form.facilitator_user_id}>{memberName(form.facilitator_user_id)}</option>
                      ) : null}
                    </Select>
                  </Field>
                  <Field label={JOURNAL_FIELD_LABEL.participants} htmlFor="pj-participants">
                    <input id="pj-participants" className={INPUT} maxLength={200} value={form.participants} disabled={trackedLocked || saving}
                      placeholder={elderName ? `예: ${elderName} 어르신(1:1)` : '예: 어르신 1:1'} onChange={(e) => set('participants', e.target.value)} />
                  </Field>

                  <Field label={JOURNAL_FIELD_LABEL.tool_used} htmlFor="pj-tool">
                    <input id="pj-tool" className={INPUT} maxLength={60} value={form.tool_used} disabled={trackedLocked || saving}
                      placeholder="예: AI 대화 프로그램 보조" onChange={(e) => set('tool_used', e.target.value)} />
                  </Field>
                  <Field label={JOURNAL_FIELD_LABEL.delivered} htmlFor="pj-delivered">
                    <div className="flex gap-[12px]">
                      <div className="w-[160px] shrink-0">
                        <Select id="pj-delivered" value={form.delivered ? 'yes' : 'no'} disabled={trackedLocked || saving}
                          onChange={(v) => set('delivered', v === 'yes')}>
                          <option value="yes">제공</option>
                          <option value="no">미제공</option>
                        </Select>
                      </div>
                      {!form.delivered ? (
                        <div className="min-w-0 flex-1">
                          <Select id="pj-reason" label={JOURNAL_FIELD_LABEL.non_delivery_reason} value={form.non_delivery_reason}
                            disabled={trackedLocked || saving}
                            onChange={(v) => set('non_delivery_reason', v as Form['non_delivery_reason'])}>
                            <option value="">사유를 골라 주세요</option>
                            {(Object.keys(NON_DELIVERY_LABEL) as JournalNonDeliveryReason[]).map((r) => (
                              <option key={r} value={r}>{NON_DELIVERY_LABEL[r]}</option>
                            ))}
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  </Field>

                  {LONG_FIELDS.map(({ key, max, placeholder }) => {
                    const ai = (AI_DRAFT_FIELDS as readonly string[]).includes(key)
                      ? (key as (typeof AI_DRAFT_FIELDS)[number])
                      : null;
                    return (
                      <Field key={key} wide label={JOURNAL_FIELD_LABEL[key]} htmlFor={`pj-${key}`}
                        badge={ai ? aiBadge : null} hint={ai ? aiEmptyHint(ai) : undefined}>
                        <div className="relative">
                          <textarea
                            id={`pj-${key}`}
                            rows={key === 'activity_content' ? 6 : 3}
                            maxLength={max}
                            value={form[key]}
                            disabled={trackedLocked || saving}
                            placeholder={placeholder}
                            onChange={(e) => set(key, e.target.value)}
                            className={cn(AREA, 'pb-[40px]')}
                          />
                          <span className="pointer-events-none absolute bottom-[14px] right-[24px] text-[16px] leading-[21px] text-ink-500">
                            {form[key].length}/{max}
                          </span>
                        </div>
                      </Field>
                    );
                  })}
                </div>

                {/* 사진 — 프로그램 일지 첨부(PF-13). 붙은 사진이 앞자리, 새로 고른 사진이 뒤. */}
                <h3 className={cn(SECTION, 'mt-[44px]')}>사진</h3>
                <div className="mt-[16px] flex gap-[44px]">
                  {Array.from({ length: SLOT.count }, (_, i) => {
                    const kept = attached[i];
                    const file = kept ? undefined : photos[i - attached.length];
                    const src = kept ? attachedUrls.data?.[kept.path] : previews[i - attached.length];
                    const full = attached.length + photos.length >= SLOT.count;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={saving || Boolean(kept || file) || full}
                        onClick={() => photoInput.current?.click()}
                        aria-label={kept || file ? `첨부 사진 ${i + 1}` : '사진 추가'}
                        className="relative shrink-0 overflow-hidden rounded-[10px] border border-line bg-mute-pale disabled:cursor-default"
                        style={{ width: SLOT.w, height: SLOT.h }}
                      >
                        {kept || file ? (
                          <img src={src} alt={kept ? (kept.caption ?? '첨부된 사진') : (file?.name ?? '')} className="h-full w-full object-cover" />
                        ) : i === attached.length + photos.length ? (
                          <>
                            <img src={asset.iconImage} alt="" className="absolute block" style={{ left: 74, top: 64, width: 35.5, height: 35 }} />
                            <span className="absolute inset-x-0 top-[110px] text-center text-w-body leading-[30px] text-ink-400">사진 업로드</span>
                          </>
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-[32px] leading-[32px] text-ink-400">+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    setPhotos((prev) => [...prev, ...picked].slice(0, Math.max(SLOT.count - attached.length, 0)));
                    e.target.value = '';
                  }}
                />

                {/* 보호자 문장 — 보호자에게는 공단 서식 대신 이것만 보인다(PF-14). 승인한 문장만 공개할 수 있다(PF-15). */}
                <div className="mt-[44px] border-t border-line pt-[36px]">
                  <Field wide label="보호자에게 보일 문장" htmlFor="pj-guardian" badge={aiBadge}
                    hint="보호자에게는 공단 서식 대신 이 문장만 보여요. 승인한 문장만 보호자에게 공개할 수 있어요.">
                    <div className="relative">
                      <textarea
                        id="pj-guardian"
                        rows={3}
                        maxLength={1000}
                        value={form.guardian_text}
                        disabled={saving}
                        placeholder="보호자에게 전할 오늘의 이야기를 적어 주세요."
                        onChange={(e) => set('guardian_text', e.target.value)}
                        className={cn(AREA, 'pb-[40px]')}
                      />
                      <span className="pointer-events-none absolute bottom-[14px] right-[24px] text-[16px] leading-[21px] text-ink-500">
                        {form.guardian_text.length}/1000
                      </span>
                    </div>
                  </Field>
                  <label className="mt-[16px] flex cursor-pointer items-center gap-[12px] text-w-sub leading-[28px] text-ink-900">
                    <input
                      type="checkbox"
                      checked={approve}
                      disabled={saving || !form.guardian_text.trim()}
                      onChange={(e) => {
                        touched.current = true;
                        setApprove(e.target.checked);
                      }}
                      className="h-[22px] w-[22px] shrink-0 accent-accent"
                    />
                    이 문장을 보호자에게 보여도 된다고 확인했어요
                  </label>
                  <p className="mt-[6px] pl-[34px] text-[16px] leading-[24px] text-ink-500">
                    {existing?.guardian_text_approved_at && !guardianChanged
                      ? `${memberName(existing.guardian_text_approved_by)} · ${dateTime(existing.guardian_text_approved_at)} 승인`
                      : seededApproved && guardianChanged
                        ? '문장을 바꾸면 다시 승인해야 해요.'
                        : '아직 승인하지 않았어요.'}
                  </p>
                </div>

                {/* 확정 뒤 수정 — 공단 칸을 바꿨으면 사유가 필수다(서버가 이력으로 남긴다). */}
                {isFinal && mayFinalize ? (
                  <div className="mt-[36px]">
                    <Field wide label={changedTracked.length ? '수정 사유 (필수)' : '수정 사유'} htmlFor="pj-reason-edit"
                      hint="확정된 일지의 공단 서식 칸을 고치면 사유와 함께 수정 이력에 남아요.">
                      <input id="pj-reason-edit" className={INPUT} maxLength={200} value={reason} disabled={saving}
                        placeholder="예: 운영 시간 오기 수정" onChange={(e) => setReason(e.target.value)} />
                    </Field>
                  </div>
                ) : null}

                {conflict ? (
                  <div
                    role="alert"
                    className="mt-[44px] flex items-center gap-[24px] rounded-[10px] bg-alert-soft px-[28px] py-[18px]"
                  >
                    <p className="mr-auto text-w-sub leading-[30px] text-ink-900" style={{ wordBreak: 'keep-all' }}>
                      다른 곳에서 이 일지가 바뀌어 저장하지 않았어요. 최신 내용을 불러오면 내가 고친 칸은 그대로 두고 나머지를 새로 채워요.
                    </p>
                    <button
                      type="button"
                      disabled={reloading}
                      onClick={() => void reloadLatest()}
                      className="h-[57px] shrink-0 whitespace-nowrap rounded-[10px] border border-accent bg-white px-[24px] text-w-sub font-semibold leading-[30px] text-accent disabled:opacity-60"
                    >
                      최신 내용 불러오기
                    </button>
                  </div>
                ) : null}

                <div className="mt-[44px] flex items-center justify-end gap-[30px]">
                  {!isFinal && !mayFinalize ? (
                    <p className="mr-auto text-[16px] leading-[24px] text-ink-500" style={{ wordBreak: 'keep-all' }}>
                      확정은 기관이 확정 권한을 준 분만 할 수 있어요.
                    </p>
                  ) : null}
                  {isFinal ? (
                    <button
                      type="button"
                      disabled={saving || conflict || !dirty}
                      onClick={() => void save('save')}
                      className="h-[57px] w-[140px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-60"
                    >
                      변경 저장
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={saving || conflict || (editing && !dirty && status !== 'failed')}
                        onClick={() => void save('save')}
                        className="h-[57px] w-[140px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent disabled:opacity-60"
                      >
                        임시 저장
                      </button>
                      <button
                        type="button"
                        disabled={saving || conflict || !mayFinalize}
                        onClick={() => void save('finalize')}
                        className="h-[57px] w-[140px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-60"
                      >
                        확정
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 상태 안내 — 상태마다 사람이 해야 할 일을 말한다. */
function StatusNotice({ journal, mayFinalize, memberName, retrying, onRetry }: {
  journal: ProgramJournalRow | null;
  mayFinalize: boolean;
  memberName: (id: string | null | undefined) => string;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (!journal) {
    return (
      <Notice>
        대화 없이 진행한 프로그램이나 미제공(결석 등)을 직접 기록할 때 써요. 대화 일지는 대화가 끝나면 자동으로 만들어져요.
      </Notice>
    );
  }
  if (journal.status === 'generating') {
    return <Notice>AI가 대화 기록으로 초안을 만들고 있어요. 먼저 적은 칸은 AI가 덮어쓰지 않아요.</Notice>;
  }
  if (journal.status === 'failed') {
    return (
      <Notice tone="alert">
        <span className="min-w-0 flex-1">
          {journal.last_error ?? '일지 초안을 만들지 못했어요.'} 다시 생성하거나 직접 적어 저장할 수 있어요.
        </span>
        <button
          type="button"
          disabled={retrying}
          onClick={onRetry}
          className="h-[44px] shrink-0 rounded-[10px] border border-accent bg-white px-[20px] text-w-sub font-semibold text-accent disabled:opacity-60"
        >
          {retrying ? '요청 중…' : '다시 생성'}
        </button>
      </Notice>
    );
  }
  if (journal.status === 'final') {
    return (
      <Notice>
        {memberName(journal.finalized_by)} · {dateTime(journal.finalized_at)} 확정.{' '}
        {mayFinalize
          ? '공단 서식 칸을 고치면 수정 사유와 함께 이력에 남아요.'
          : '공단 서식 칸은 확정 권한이 있는 분만 고칠 수 있어요. 보호자 문장은 고칠 수 있어요.'}
      </Notice>
    );
  }
  // 확인 대기 — AI 를 건너뛴 이유(처리 동의 없음 등)가 있으면 그대로 보여 준다.
  if (journal.last_error) return <Notice>{journal.last_error}</Notice>;
  if (journal.draft_generated_at) {
    return <Notice>AI 초안이 도착했어요. 'AI 초안' 칸을 확인·수정한 뒤 확정해 주세요.</Notice>;
  }
  if (journal.session_id) return <Notice>AI 초안 없이 만들어진 일지예요. 직접 작성해 주세요.</Notice>;
  return <Notice>확인 대기 중인 일지예요. 내용을 확인한 뒤 확정해 주세요.</Notice>;
}

function Notice({ tone, children }: { tone?: 'alert'; children: ReactNode }) {
  return (
    <div
      role={tone === 'alert' ? 'alert' : 'status'}
      className={cn(
        'mt-[28px] flex items-center gap-[20px] rounded-[10px] px-[24px] py-[18px] text-w-sub leading-[28px] text-ink-900',
        tone === 'alert' ? 'border border-alert bg-white' : 'bg-mute-pale',
      )}
      style={{ wordBreak: 'keep-all' }}
    >
      {children}
    </div>
  );
}

/** 값 표기 — 이력의 이전·변경 값. */
function revisionValue(field: string, value: unknown, memberName: (id: string | null | undefined) => string): string {
  if (value === null || value === undefined || value === '') return '(비어 있음)';
  if (field === 'facilitator_user_id') return memberName(String(value));
  if (field === 'delivered') return value ? '제공' : '미제공';
  if (field === 'non_delivery_reason') return NON_DELIVERY_LABEL[value as JournalNonDeliveryReason] ?? String(value);
  if (field === 'operated_from' || field === 'operated_to') return String(value).slice(0, 5);
  return String(value);
}

/** 이력 탭 — 확정 뒤 수정(사유·바뀐 칸)과 생성·확정 시각. */
function History({ journal, revisions, loading, memberName }: {
  journal: ProgramJournalRow;
  revisions: ProgramJournalRevisionRow[] | undefined;
  loading: boolean;
  memberName: (id: string | null | undefined) => string;
}) {
  const rows = revisions ?? [];
  return (
    <div className="mt-[28px]">
      <dl className="grid grid-cols-[140px_1fr] gap-y-[10px] text-w-sub leading-[28px]">
        <dt className="text-ink-500">만든 시각</dt>
        <dd className="text-ink-900">{dateTime(journal.created_at)}{journal.session_id ? ' · 대화 종료로 자동 생성' : ` · ${memberName(journal.created_by)} 작성`}</dd>
        <dt className="text-ink-500">AI 초안</dt>
        <dd className="text-ink-900">{journal.draft_generated_at ? dateTime(journal.draft_generated_at) : '없음'}</dd>
        <dt className="text-ink-500">확정</dt>
        <dd className="text-ink-900">{journal.finalized_at ? `${memberName(journal.finalized_by)} · ${dateTime(journal.finalized_at)}` : '아직 확정 전이에요'}</dd>
      </dl>

      <h3 className={cn(SECTION, 'mt-[40px]')}>확정 뒤 수정</h3>
      {loading ? (
        <p className="mt-[16px] text-w-sub leading-[28px] text-ink-500">이력을 불러오고 있어요.</p>
      ) : rows.length === 0 ? (
        <p className="mt-[16px] text-w-sub leading-[28px] text-ink-500">확정 뒤 고친 기록이 없어요.</p>
      ) : (
        <ol className="mt-[16px] flex flex-col gap-[16px]">
          {rows.map((r) => {
            const changes = Object.entries((r.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>);
            return (
              <li key={r.id} className="rounded-[10px] border border-line px-[28px] py-[22px]">
                <p className="text-w-sub leading-[28px] text-ink-500">
                  {dateTime(r.changed_at)} · {memberName(r.changed_by)}
                </p>
                <p className="mt-[4px] text-w-body font-semibold leading-[28px] text-ink-900" style={{ wordBreak: 'keep-all' }}>
                  사유: {r.reason}
                </p>
                <ul className="mt-[10px] flex flex-col gap-[6px]">
                  {changes.map(([field, c]) => (
                    <li key={field} className="text-w-sub leading-[28px] text-ink-700" style={{ wordBreak: 'keep-all' }}>
                      <span className="font-semibold text-ink-900">{JOURNAL_FIELD_LABEL[field] ?? field}</span>{' '}
                      <span className="whitespace-pre-wrap">{revisionValue(field, c.from, memberName)}</span>
                      {' → '}
                      <span className="whitespace-pre-wrap">{revisionValue(field, c.to, memberName)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
