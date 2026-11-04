// 요양보호사 플로팅 대화창 — 규칙 기반 업무 도우미 + 보호자 메시지(2026-11-04 사용자 결정).
//
// 업무 4가지: 대화 세션 설계 · 공개 관리 · 보호자 메시지 확인·답장 · 확인할 일 안내.
// ⛔ 대화로 모은 값은 **확인 카드**를 거쳐 사람이 '확인'을 눌러야 실행한다. 실행 경로는 기존 화면과 같다
//    (세션 설계 = `useCreateSession` status 'planned' · 공개 = `guardian_shares` 생성/철회 — 확정·문장 승인·철회 권한은
//    서버가 그대로 판정한다). 일지 확정·위기 확인은 여기서 하지 않고 해당 화면으로 안내한다.
// 공개는 항목의 **요약 줄**(일지 = 보호자 문장 · 대화 = 요약)만 켠다. 사진·AI 분석까지 고르는 세부 설정은 공개 관리 화면.
// 비공개 전환은 공개 관리 화면과 같이 그 항목에 걸린 공개 전부(사진·AI 분석 포함)를 내린다.
// 자유 입력(2026-11-04): "박희수 어르신 세션 설계하는데, 주제는 가족으로" 처럼 한 문장으로 말해도 core
//   `parseCaregiverCommand`(규칙 기반)가 업무·값을 뽑는다. 말하지 않은 설계 값은 모달 기본값으로 채우고 어르신·제목·목표만
//   다시 묻는다. 확인 카드가 뜬 뒤 "10분으로 바꿔"·"목표는 …" 처럼 말하면 고친 새 카드를 다시 띄운다.
//   공개("어제 일지 공개해 줘")·답장("김보호 보호자께 '…'라고 답장")도 항목·스레드가 하나로 정해지면 바로 확인 카드로 간다.
import { errorText } from '../../lib/errorText';
import { useMemo, useState } from 'react';
import {
  applyPlanAnswer,
  CAREGIVER_GREETING,
  CAREGIVER_TASKS,
  dateDot,
  hasLabelledPlanSlots,
  hasPlanSlots,
  isCancel,
  matchElder,
  mergePlan,
  nextPlanStep,
  parseCaregiverCommand,
  planPatch,
  planQuestion,
  planSummary,
  seoulDate,
  SESSION_MAX_MINUTES,
  type CaregiverCommand,
  type CaregiverTask,
  type ElderChoice,
  type PlanDraft,
  type ShareSlots,
} from '@giokon/core';
import {
  parseSessionAnalysis,
  useCreateGuardianShare,
  useCreateSession,
  useCurrentUser,
  useGuardianShares,
  useHasCapability,
  useMarkNotificationRead,
  useMyMessages,
  useMyNotifications,
  useOrgGuardianLinks,
  useOrgSettings,
  usePendingJournalCounts,
  useProfiles,
  useProgramJournalPhotosByJournals,
  useProgramJournals,
  useReplyMessage,
  useRevokeGuardianShare,
  useSessionAnalyses,
  useUnacknowledgedSafetyEvents,
  type GuardianShareRow,
  type MessageRow,
  type ShareItemType,
} from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { journalErrorMessage } from '../../lib/journalErrors';
import { AssistantWindow, ConfirmCard, type ChatChip, type ChatItem } from './AssistantWindow';

const MESSAGE_MAX = 1000;
let seq = 0;
const nextId = () => `c${++seq}`;
const now = () => new Date().toISOString();

/** 대화 기록 — 확인 카드는 JSX 가 아니라 **값**으로 남기고 그릴 때 만든다(버튼 상태가 낡지 않게). */
type LogItem =
  | ChatItem
  | { id: string; kind: 'confirm'; at: string; spec: ConfirmSpec };

type ConfirmSpec =
  | { type: 'design'; draft: PlanDraft }
  | { type: 'share'; elder: ElderChoice; item: ShareItem; shared: boolean }
  | { type: 'reply'; profileId: string; guardianId: string; title: string; body: string };

type Flow =
  | { kind: 'idle' }
  /** quick = 자유 입력으로 시작 — 선택 항목은 모달 기본값으로 채워져 있다(어르신·제목·목표만 묻는다). */
  | { kind: 'design'; draft: PlanDraft; candidates?: ElderChoice[]; quick?: boolean }
  /** want = 문장에서 읽은 공개 대상(종류·날짜·공개/철회) — 항목을 불러오면 한 번 맞춰 본다. only = 칩을 좁힌 항목 id. */
  | { kind: 'share'; elder?: ElderChoice; candidates?: ElderChoice[]; want?: ShareSlots; only?: string[] };

interface ShareItem {
  type: 'journal' | 'analysis';
  id: string;
  /** 한국 날짜(YYYY-MM-DD) — "어제 일지" 같은 말과 맞춘다. */
  date: string;
  title: string;
  body: string;
  /** 일지는 확정 + 보호자 문장 승인이어야 공개된다(서버 게이트와 같은 조건을 미리 알린다). */
  ready: boolean;
}

interface Thread {
  key: string;
  profileId: string;
  guardianId: string | null;
  rows: MessageRow[];
  last: MessageRow;
}

function WordmarkTitle() {
  return (
    <>
      <img src={asset.wordmark} alt="GIEOK-ON" className="h-[20px] w-auto brightness-0" />
      <span>AI</span>
    </>
  );
}

const shareKey = (type: ShareItemType, id: string) => `${type}:${id}`;
const summaryTypeOf = (type: ShareItem['type']): ShareItemType => (type === 'journal' ? 'journal' : 'session_summary');

export function CaregiverAssistant() {
  const { isConfigured } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'ai' | 'inbox' | 'thread'>('ai');
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(now);
  const [text, setText] = useState('');
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' });
  const [items, setItems] = useState<LogItem[]>(() => [greeting()]);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [doneCards, setDoneCards] = useState<Set<string>>(() => new Set());

  const enabled = isConfigured && open;
  const me = useCurrentUser();
  const profiles = useProfiles({ enabled });
  const settings = useOrgSettings({ enabled });
  const elders = useMemo<ElderChoice[]>(
    () => (profiles.data ?? []).map((p) => ({ id: p.id, name: p.name })),
    [profiles.data],
  );
  const elderName = useMemo(() => new Map(elders.map((e) => [e.id, e.name])), [elders]);
  const defaultAvoid = settings.data?.default_avoid_topics ?? [];
  const createSession = useCreateSession();

  // 공개 관리 — 고른 어르신의 항목·공개 상태.
  const shareElderId = flow.kind === 'share' ? flow.elder?.id : undefined;
  const journals = useProgramJournals(shareElderId);
  const analyses = useSessionAnalyses(shareElderId);
  const shares = useGuardianShares(shareElderId);
  const finalJournalIds = useMemo(
    () => (journals.data ?? []).filter((j) => j.status === 'final').map((j) => j.id),
    [journals.data],
  );
  const photos = useProgramJournalPhotosByJournals(finalJournalIds);
  const canRevoke = useHasCapability('share_revoke', { enabled }).data !== false;
  const publish = useCreateGuardianShare();
  const revoke = useRevokeGuardianShare();

  // 확인할 일.
  const pendingCounts = usePendingJournalCounts({ enabled });
  const unackSafety = useUnacknowledgedSafetyEvents({ enabled });

  // 보호자 메시지.
  const messages = useMyMessages({ enabled });
  const guardianLinks = useOrgGuardianLinks({ enabled });
  const notifications = useMyNotifications({ enabled });
  const markRead = useMarkNotificationRead();
  const reply = useReplyMessage();

  const say = (...add: LogItem[]) => setItems((prev) => [...prev, ...add]);
  const bot = (t: string, links?: { label: string; to: string }[]): ChatItem => ({ id: nextId(), kind: 'text', from: 'bot', text: t, at: now(), links });
  const mine = (t: string): ChatItem => ({ id: nextId(), kind: 'text', from: 'me', text: t, at: now() });

  // ── 보호자 메시지 스레드(어르신 × 보호자) ──
  const guardianName = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of guardianLinks.data ?? []) if (l.guardian?.name) map.set(l.guardian_user_id, l.guardian.name);
    return map;
  }, [guardianLinks.data]);
  const guardianChoices = useMemo<ElderChoice[]>(
    () => [...guardianName].map(([id, name]) => ({ id, name })),
    [guardianName],
  );
  const unreadBySource = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notifications.data ?? []) {
      if (n.kind === 'message' && !n.read_at && n.source_id) map.set(n.source_id, n.id);
    }
    return map;
  }, [notifications.data]);
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    for (const m of messages.data ?? []) {
      const guardianId = m.sender_role === 'caregiver' ? m.recipient_user_id : m.sender_user_id;
      const key = `${m.profile_id}:${guardianId ?? 'unknown'}`;
      const t = map.get(key);
      if (t) t.rows.push(m);
      else map.set(key, { key, profileId: m.profile_id, guardianId, rows: [m], last: m });
    }
    // 메시지는 최신순으로 온다 → 스레드도 마지막 메시지 최신순.
    return [...map.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [messages.data]);
  const unreadOf = (t: Thread) => t.rows.filter((m) => unreadBySource.has(m.id)).length;
  const totalUnread = threads.reduce((n, t) => n + unreadOf(t), 0);
  const thread = threads.find((t) => t.key === threadKey) ?? null;
  const threadTitle = (t: Thread) =>
    `${(t.guardianId && guardianName.get(t.guardianId)) || '보호자'} 보호자 · ${elderName.get(t.profileId) ?? '어르신'} 어르신`;

  function openThread(t: Thread) {
    setThreadKey(t.key);
    setView('thread');
    for (const m of t.rows) {
      const nid = unreadBySource.get(m.id);
      if (nid) markRead.mutate(nid);
    }
  }

  // ── 업무 시작 ──
  function start(task: CaregiverTask) {
    if (!isConfigured) {
      say(bot('서버에 연결되지 않아 업무를 처리할 수 없어요.'));
      return;
    }
    if (task === 'messages') {
      setView('inbox');
      return;
    }
    if (task === 'todo') {
      showTodo();
      return;
    }
    if (task === 'design') {
      setFlow({ kind: 'design', draft: {} });
      say(bot(planQuestion('elder', {}, { defaultAvoid })));
    } else {
      setFlow({ kind: 'share' });
      say(bot('어느 어르신의 공개를 관리할까요? 성함을 말씀해 주세요.'));
    }
  }

  // ── 자유 입력 한 문장 ──
  const commandCtx = () => ({ elders, guardians: guardianChoices, today: seoulDate() });
  const mergeCtx = () => ({ today: seoulDate(), orgTarget: settings.data?.target_minutes, defaultAvoid });

  function runCommand(cmd: CaregiverCommand) {
    if (!cmd.task) {
      say(bot('제가 도와드릴 수 있는 일은 아래 네 가지예요. 골라 주세요.\n예: \'박희수 어르신 세션 설계, 주제는 가족으로\''));
      return;
    }
    if (!isConfigured) {
      say(bot('서버에 연결되지 않아 업무를 처리할 수 없어요.'));
      return;
    }
    const missing = cmd.unknownElder ? [`'${cmd.unknownElder}' 어르신을 담당 어르신 목록에서 찾지 못했어요.`] : [];
    const many = cmd.elders.length > 1 ? cmd.elders : undefined;
    if (cmd.task === 'design') {
      const { draft, notes } = mergePlan({}, cmd, mergeCtx(), true);
      continueDesign({ kind: 'design', draft, quick: true, candidates: many }, [...missing, ...cmd.problems, ...notes]);
    } else if (cmd.task === 'share') {
      const elder = cmd.elders.length === 1 ? cmd.elders[0] : undefined;
      const want = cmd.share.kind || cmd.share.date ? cmd.share : undefined;
      setFlow({ kind: 'share', elder, candidates: many, want });
      say(bot(elder
        ? `${elder.name} 어르신의 공개할 수 있는 항목을 불러올게요.`
        : [...missing, many ? '같은 이름이 여러 분이에요. 아래에서 골라 주세요.' : '어느 어르신의 공개를 관리할까요? 성함을 말씀해 주세요.'].join('\n')));
    } else if (cmd.task === 'messages') {
      replyCommand(cmd);
    } else {
      showTodo();
    }
  }

  /** "김보호 보호자께 '…'라고 답장" — 스레드가 하나로 정해지면 답장 확인 카드, 본문이 없으면 그 스레드를 연다. */
  function replyCommand(cmd: CaregiverCommand) {
    const named = cmd.reply.guardians;
    if (!named.length) {
      setView('inbox');
      return;
    }
    if (messages.isError) return say(bot('보호자 메시지를 불러오지 못했어요. 잠시 뒤 다시 말씀해 주세요. (없다는 뜻이 아니에요)'));
    if (!messages.data) return say(bot('보호자 메시지를 불러오는 중이에요. 잠시 뒤 다시 말씀해 주세요.'));
    const ids = new Set(named.map((g) => g.id));
    const profileIds = new Set(cmd.elders.map((e) => e.id));
    const hits = threads.filter((t) => t.guardianId && ids.has(t.guardianId) && (!profileIds.size || profileIds.has(t.profileId)));
    if (hits.length !== 1) {
      setView('inbox');
      say(bot(hits.length
        ? '그 보호자와 주고받은 대화가 여러 개예요. 메시지 목록에서 골라 주세요.'
        : `${named.map((g) => g.name).join(', ')} 보호자와 주고받은 메시지가 없어요. 답장은 보호자가 보낸 메시지에만 할 수 있어요.`));
      return;
    }
    const t = hits[0];
    const body = cmd.reply.body?.trim();
    if (!body) {
      openThread(t);
      return;
    }
    if (body.length > MESSAGE_MAX) return say(bot(`답장은 ${MESSAGE_MAX}자까지 보낼 수 있어요.`));
    say(bot('아래 답장을 보낼까요? 확인을 누르면 보내요.'), {
      id: nextId(), kind: 'confirm', at: now(),
      spec: { type: 'reply', profileId: t.profileId, guardianId: t.guardianId as string, title: threadTitle(t), body },
    });
  }

  function replyCard(cardId: string, spec: Extract<ConfirmSpec, { type: 'reply' }>) {
    return (
      <ConfirmCard
        title="보호자에게 답장"
        rows={[['받는 사람', spec.title], ['보낼 글', spec.body]]}
        confirmLabel="답장 보내기"
        pending={pendingCard === cardId}
        done={doneCards.has(cardId)}
        onCancel={() => finishCard(cardId, '답장을 보내지 않았어요.')}
        onConfirm={() => {
          const userId = me.data?.id;
          if (!userId) return finishCard(cardId, '로그인 정보를 확인할 수 없어요.');
          setPendingCard(cardId);
          reply.mutate(
            { profileId: spec.profileId, senderUserId: userId, recipientUserId: spec.guardianId, body: spec.body },
            {
              onSuccess: () => finishCard(cardId, '답장을 보냈어요.'),
              onError: () => { setPendingCard(null); say(bot('답장을 보내지 못했어요. 담당 어르신의 연결된 보호자에게만 답장할 수 있어요.')); },
            },
          );
        }}
      />
    );
  }

  function showTodo() {
    if (pendingCounts.isError || unackSafety.isError) {
      say(bot('확인할 일을 불러오지 못했어요. 잠시 뒤 다시 물어봐 주세요. (없다는 뜻이 아니에요)'));
      return;
    }
    if (!pendingCounts.data || !unackSafety.data) {
      say(bot('확인할 일을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.'));
      return;
    }
    const lines: string[] = [];
    const links: { label: string; to: string }[] = [];
    const safety = unackSafety.data.length;
    if (safety) {
      lines.push(`확인하지 않은 안전 알림 ${safety}건이 있어요. 감독 화면에서 확인해 주세요.`);
      links.push({ label: '감독 화면 열기', to: '/caregiver/supervision' });
    }
    for (const [pid, n] of Object.entries(pendingCounts.data)) {
      lines.push(`${elderName.get(pid) ?? '어르신'} 어르신 · 확인 대기 일지 ${n}건`);
      links.push({ label: `${elderName.get(pid) ?? '어르신'} 어르신 일지 확인`, to: `/caregiver/journal/${pid}` });
    }
    if (totalUnread) {
      lines.push(`읽지 않은 보호자 메시지 ${totalUnread}건이 있어요.`);
    }
    say(bot(lines.length ? lines.join('\n') : '지금 확인할 일이 없어요.', links.slice(0, 6)));
  }

  // ── 세션 설계 ──
  function designAnswer(draft: PlanDraft, value: string) {
    const r = applyPlanAnswer(draft, value, { elders, today: seoulDate(), defaultAvoid });
    if (!r.ok) {
      const candidates = nextPlanStep(draft) === 'elder' ? (matchElder(value, elders).length ? matchElder(value, elders) : elders) : undefined;
      setFlow({ kind: 'design', draft, candidates });
      say(bot(r.reason));
      return;
    }
    continueDesign({ kind: 'design', draft: r.draft, quick: flow.kind === 'design' && flow.quick });
  }

  /** 설계 초안을 두고 다음 질문 또는 확인 카드를 띄운다. 앞서 띄운 카드는 닫는다(고친 값으로 새 카드). */
  function continueDesign(next: Extract<Flow, { kind: 'design' }>, notes: string[] = []) {
    closeOpenCard();
    setFlow(next);
    const step = nextPlanStep(next.draft);
    const lead = notes.length ? `${notes.join('\n')}\n` : '';
    if (step === 'elder' && next.candidates?.length) {
      say(bot(`${lead}같은 이름이 여러 분이에요. 아래에서 골라 주세요.`));
      return;
    }
    if (step !== 'confirm') {
      say(bot(lead + planQuestion(step, next.draft, { defaultAvoid })));
      return;
    }
    say(
      bot(`${lead}${planQuestion('confirm', next.draft, { defaultAvoid })}\n바꿀 것이 있으면 '8분으로', '내일로', '목표는 …'처럼 말씀해 주세요.`),
      { id: nextId(), kind: 'confirm', at: now(), spec: { type: 'design', draft: next.draft } },
    );
  }

  /** 진행 중 단계에서 "목표는 …"·(확인 단계) "10분으로 바꿔" 같은 고치는 말을 합친다. */
  function designEdit(cur: Extract<Flow, { kind: 'design' }>, cmd: CaregiverCommand) {
    const { draft, notes } = mergePlan(cur.draft, cmd, mergeCtx(), Boolean(cur.quick));
    continueDesign({ ...cur, draft, candidates: cmd.elders.length > 1 ? cmd.elders : undefined }, [...cmd.problems, ...notes]);
  }

  function designCard(cardId: string, draft: PlanDraft) {
    return (
      <ConfirmCard
        title="세션 설계"
        rows={planSummary(draft)}
        confirmLabel="설계 저장"
        pending={pendingCard === cardId}
        done={doneCards.has(cardId)}
        onCancel={() => finishCard(cardId, '세션 설계를 취소했어요.')}
        onConfirm={() => {
          const patch = planPatch(draft);
          const userId = me.data?.id;
          if (!patch || !draft.elder || !userId) return finishCard(cardId, '필요한 값이 빠져 저장하지 못했어요. 처음부터 다시 해 주세요.');
          setPendingCard(cardId);
          const elder = draft.elder;
          createSession.mutate(
            { profile_id: elder.id, user_id: userId, status: 'planned', ...patch },
            {
              onSuccess: () => finishCard(cardId, '세션을 설계했어요. 앱에서 진행할 수 있어요.', [
                { label: `${elder.name} 어르신 세션 목록`, to: `/caregiver/sessions/${elder.id}` },
              ]),
              onError: (e) => { setPendingCard(null); say(bot(errorText(e, '저장하지 못했어요.'))); },
            },
          );
        }}
      />
    );
  }

  /** 결정을 기다리던 확인 카드를 말없이 닫는다(새 카드로 바뀌거나 취소될 때). */
  function closeOpenCard() {
    const open = [...items].reverse().find((it) => it.kind === 'confirm' && !doneCards.has(it.id));
    if (open && pendingCard !== open.id) setDoneCards((s) => new Set(s).add(open.id));
  }

  function finishCard(cardId: string, message: string, links?: { label: string; to: string }[]) {
    setPendingCard(null);
    setDoneCards((s) => new Set(s).add(cardId));
    setFlow({ kind: 'idle' });
    say(bot(message, links));
  }

  // ── 공개 관리 ──
  const activeShare = useMemo(() => {
    const map = new Map<string, GuardianShareRow>();
    for (const s of shares.data ?? []) if (!s.revoked_at) map.set(shareKey(s.item_type, s.item_id), s);
    return map;
  }, [shares.data]);
  const allShareItems = useMemo<ShareItem[]>(() => {
    const out: (ShareItem & { at: string })[] = [];
    for (const j of journals.data ?? []) {
      if (j.status !== 'final') continue;
      out.push({
        type: 'journal', id: j.id, at: j.journal_date, date: j.journal_date,
        title: `${dateDot(j.journal_date)} 프로그램 일지`,
        body: j.guardian_text_approved_at && j.guardian_text ? j.guardian_text : '보호자 문장이 아직 승인되지 않았어요.',
        ready: Boolean(j.guardian_text_approved_at && j.guardian_text),
      });
    }
    for (const row of analyses.data ?? []) {
      const a = parseSessionAnalysis(row);
      if (!a) continue;
      out.push({
        type: 'analysis', id: row.id, at: row.created_at, date: seoulDate(new Date(row.created_at)),
        title: `${dateDot(row.created_at)} AI 회상 대화 요약`, body: a.summary, ready: true,
      });
    }
    return out.sort((x, y) => y.at.localeCompare(x.at));
  }, [journals.data, analyses.data]);
  const shareItems = useMemo(() => allShareItems.slice(0, 8), [allShareItems]);
  const shareLoaded = Boolean(shareElderId) && journals.isSuccess && analyses.isSuccess && shares.isSuccess && photos.isSuccess;
  const shareFailed = Boolean(shareElderId) && (journals.isError || analyses.isError || shares.isError || photos.isError);

  function liveSharesOf(item: ShareItem): GuardianShareRow[] {
    const keys = [shareKey(summaryTypeOf(item.type), item.id)];
    if (item.type === 'analysis') keys.push(shareKey('analysis', item.id));
    const out = keys.map((k) => activeShare.get(k)).filter((v): v is GuardianShareRow => Boolean(v));
    if (item.type === 'journal') {
      const mine = new Set((photos.data ?? []).filter((p) => p.journal_id === item.id).map((p) => p.id));
      for (const s of shares.data ?? []) if (!s.revoked_at && s.item_type === 'photo' && mine.has(s.item_id)) out.push(s);
    }
    return out;
  }

  function pickShareItem(item: ShareItem, typed = false) {
    const elder = flow.kind === 'share' ? flow.elder : undefined;
    if (!elder) return;
    const live = liveSharesOf(item);
    const shared = live.length > 0;
    if (!typed) say(mine(item.title));
    if (!shared && !item.ready) {
      say(bot('확정되고 보호자 문장이 승인된 일지만 공개할 수 있어요. 일지 화면에서 보호자 문장을 승인해 주세요.', [
        { label: '일지 확인', to: `/caregiver/journal/${elder.id}/${item.id}` },
      ]));
      return;
    }
    if (shared && !canRevoke) {
      say(bot('공개 철회 권한이 없어요. 기관 권한 위임 표에서 공개 철회 권한을 받은 분이 철회할 수 있어요.'));
      return;
    }
    say({ id: nextId(), kind: 'confirm', at: now(), spec: { type: 'share', elder, item, shared } });
  }

  function shareCard(cardId: string, elder: ElderChoice, item: ShareItem, shared: boolean) {
    return (
      <ConfirmCard
        title={shared ? '비공개로 전환' : '보호자에게 공개'}
        rows={[
          ['어르신', `${elder.name} 어르신`],
          ['항목', item.title],
          ['보호자에게 보일 글', item.body],
          ...(shared ? [['함께 내림', '이 항목의 사진·AI 분석 공개도 함께 내려요.'] as [string, string]] : []),
        ]}
        confirmLabel={shared ? '비공개로 전환' : '공개하기'}
        pending={pendingCard === cardId}
        done={doneCards.has(cardId)}
        onCancel={() => finishCard(cardId, '공개 관리를 취소했어요.')}
        onConfirm={async () => {
          const userId = me.data?.id;
          if (!userId) return finishCard(cardId, '로그인 정보를 확인할 수 없어요.');
          setPendingCard(cardId);
          try {
            if (shared) {
              // 확인 순간의 공개 행으로 내린다(카드를 띄운 뒤 바뀌었을 수 있다).
              for (const row of liveSharesOf(item)) await revoke.mutateAsync({ id: row.id, userId });
              finishCard(cardId, '비공개로 전환했어요.', [{ label: '공개 관리 화면', to: `/caregiver/shares/${elder.id}` }]);
            } else {
              await publish.mutateAsync({
                profile_id: elder.id, item_type: summaryTypeOf(item.type), item_id: item.id,
                shared_by: userId, notify_on_view: false,
              });
              finishCard(cardId, '보호자에게 공개했어요. 사진·AI 분석까지 공개하려면 공개 관리 화면에서 설정해 주세요.', [
                { label: '공개 관리 화면', to: `/caregiver/shares/${elder.id}` },
              ]);
            }
          } catch (e) {
            setPendingCard(null);
            say(bot(journalErrorMessage(e, '처리하지 못했어요.')));
          }
        }}
      />
    );
  }

  // 문장으로 고른 공개 대상("어제 일지 공개해 줘")을 항목이 불러와진 뒤 한 번 맞춰 본다.
  // 렌더 중 상태 갱신(React 의 '이전 값에 맞춰 상태 조정' 방식) — want 를 지우므로 한 번만 돈다.
  if (flow.kind === 'share' && flow.elder && flow.want && (shareLoaded || shareFailed)) {
    const want = flow.want;
    if (shareFailed) {
      setFlow({ ...flow, want: undefined });
    } else {
      const base = allShareItems.filter((it) => (!want.kind || it.type === want.kind) && (!want.date || it.date === want.date));
      const fit = want.action
        ? base.filter((it) => (liveSharesOf(it).length > 0) === (want.action === 'revoke'))
        : base;
      const what = `${want.date ? `${dateDot(want.date)} ` : ''}${want.kind === 'journal' ? '일지' : want.kind === 'analysis' ? '대화 요약' : '항목'}`;
      if (fit.length === 1) {
        setFlow({ ...flow, want: undefined });
        pickShareItem(fit[0], true);
      } else if (!base.length) {
        setFlow({ ...flow, want: undefined });
        say(bot(`말씀하신 ${what}을(를) 찾지 못했어요. 확정된 일지와 끝난 대화만 공개할 수 있어요.`));
      } else if (!fit.length) {
        setFlow({ ...flow, want: undefined, only: base.map((it) => it.id) });
        say(bot(want.action === 'publish' ? `말씀하신 ${what}은(는) 이미 공개 중이에요.` : `말씀하신 ${what}은(는) 공개 중이 아니에요.`));
      } else {
        setFlow({ ...flow, want: undefined, only: fit.map((it) => it.id) });
        say(bot(`말씀하신 ${what}이(가) ${fit.length}개예요. 아래에서 골라 주세요.`));
      }
    }
  }

  // ── 입력 ──
  function submit() {
    const value = text.trim();
    if (!value) return;
    if (view === 'thread') {
      if (!thread || !thread.guardianId || !me.data?.id) return;
      reply.mutate(
        { profileId: thread.profileId, senderUserId: me.data.id, recipientUserId: thread.guardianId, body: value },
        {
          onSuccess: () => setText(''),
          onError: () => say(bot('답장을 보내지 못했어요. 담당 어르신의 연결된 보호자에게만 답장할 수 있어요.')),
        },
      );
      return;
    }
    setText('');
    if (view === 'inbox') setView('ai');
    if (isCancel(value) && (flow.kind !== 'idle' || openCard)) {
      closeOpenCard();
      say(mine(value), bot('진행하던 일을 취소했어요. 무엇을 할까요?'));
      setFlow({ kind: 'idle' });
      return;
    }
    if (openCard && flow.kind !== 'design') {
      say(mine(value), bot('위 카드에서 확인 또는 취소를 눌러 주세요. 그만하려면 \'취소\'라고 말씀해 주세요.'));
      return;
    }
    if (flow.kind === 'design') {
      say(mine(value));
      // 단계 질문에 답하는 중이면 꼬리표("목표는 …")가 있을 때만 고치는 말로 읽는다 — 답 속의 '10분'·'내일' 을 값으로 오해하지 않게.
      // 확인 단계에서는 '10분으로'·'내일로' 같은 꼬리표 없는 말도 고치는 말이다.
      const atConfirm = nextPlanStep(flow.draft) === 'confirm';
      const cmd = parseCaregiverCommand(value, commandCtx());
      if (atConfirm ? hasPlanSlots(cmd) || cmd.problems.length > 0 : hasLabelledPlanSlots(value)) {
        designEdit(flow, cmd);
      } else if (atConfirm) {
        say(bot('바꿀 내용을 알아듣지 못했어요. \'8분으로\', \'내일로\', \'목표는 …\'처럼 말씀해 주세요. 그대로면 카드의 \'설계 저장\'을 눌러 주세요.'));
      } else {
        designAnswer(flow.draft, value);
      }
      return;
    }
    if (flow.kind === 'share' && !flow.elder) {
      say(mine(value));
      const hits = matchElder(value, elders);
      if (hits.length === 1) {
        setFlow({ kind: 'share', elder: hits[0] });
        say(bot(`${hits[0].name} 어르신의 공개할 수 있는 항목을 불러올게요.`));
      } else {
        setFlow({ kind: 'share', candidates: hits.length ? hits : elders });
        say(bot(hits.length ? '같은 이름이 여러 분이에요. 아래에서 골라 주세요.' : '그 성함의 어르신을 찾지 못했어요. 아래에서 골라 주세요.'));
      }
      return;
    }
    say(mine(value));
    runCommand(parseCaregiverCommand(value, commandCtx()));
  }

  // ── 칩 ──
  const elderChips = (list: ElderChoice[], pick: (e: ElderChoice) => void): ChatChip[] =>
    list.slice(0, 8).map((e) => ({ label: `${e.name} 어르신`, onClick: () => { say(mine(`${e.name} 어르신`)); pick(e); } }));

  // 확인 카드가 결정을 기다리면 칩을 숨긴다(카드 버튼으로 정한다 — 다른 일로 새지 않게).
  // 말풍선이 뒤에 더 붙어도(카드가 맨 끝이 아니어도) 결정 전 카드가 있으면 열린 것으로 본다.
  const lastItem = items[items.length - 1];
  const openCard = items.some((it) => it.kind === 'confirm' && !doneCards.has(it.id));

  let chips: ChatChip[] = [];
  if (view === 'ai' && openCard) {
    chips = [];
  } else if (view === 'ai') {
    if (flow.kind === 'idle') {
      chips = CAREGIVER_TASKS.map((t) => ({
        label: t.task === 'messages' && totalUnread ? `${t.label} (${totalUnread})` : t.label,
        onClick: () => { say(mine(t.label)); start(t.task); },
      }));
    } else if (flow.kind === 'design') {
      const step = nextPlanStep(flow.draft);
      const answer = (v: string) => { say(mine(v)); designAnswer(flow.draft, v); };
      if (step === 'elder') {
        // 같은 이름이 여럿이면 이름으로 고를 수 없다 → id 로 직접 정한다.
        chips = (flow.candidates ?? elders).slice(0, 8).map((e) => ({
          label: `${e.name} 어르신`,
          onClick: () => {
            say(mine(`${e.name} 어르신`));
            const draft = { ...flow.draft, elder: e };
            setFlow({ kind: 'design', draft });
            say(bot(planQuestion(nextPlanStep(draft), draft, { defaultAvoid })));
          },
        }));
      } else if (step === 'minutes') {
        chips = Array.from({ length: SESSION_MAX_MINUTES - 4 }, (_, i) => `${i + 5}분`).map((m) => ({ label: m, onClick: () => answer(m) }));
      } else if (step === 'date') {
        chips = ['오늘', '내일', '모레'].map((d) => ({ label: d, onClick: () => answer(d) }));
      } else if (step === 'avoid') {
        chips = [
          ...(defaultAvoid.length ? [{ label: '기본값 사용', onClick: () => answer('기본값 사용') }] : []),
          { label: '건너뛰기', onClick: () => answer('건너뛰기') },
        ];
      } else if (step === 'content' || step === 'keywords') {
        chips = [{ label: '건너뛰기', onClick: () => answer('건너뛰기') }];
      }
      chips.push({ label: '취소', onClick: () => { say(mine('취소'), bot('세션 설계를 취소했어요.')); setFlow({ kind: 'idle' }); } });
    } else if (flow.kind === 'share') {
      if (!flow.elder) {
        chips = elderChips(flow.candidates ?? elders, (e) => {
          setFlow({ kind: 'share', elder: e });
          say(bot(`${e.name} 어르신의 공개할 수 있는 항목을 불러올게요.`));
        });
      } else if (shareFailed) {
        chips = [];
      } else if (shareLoaded) {
        const only = flow.only;
        chips = (only ? allShareItems.filter((it) => only.includes(it.id)) : shareItems).map((it) => {
          const shared = liveSharesOf(it).length > 0;
          return { label: `${it.title} · ${shared ? '공개 중' : '미공개'}`, onClick: () => pickShareItem(it) };
        });
      }
      chips.push({ label: '취소', onClick: () => { say(mine('취소'), bot('공개 관리를 취소했어요.')); setFlow({ kind: 'idle' }); } });
    }
  } else if (view === 'inbox') {
    chips = [{ label: 'AI 도우미로 돌아가기', onClick: () => setView('ai') }];
  } else {
    chips = [{ label: '메시지 목록', onClick: () => setView('inbox') }];
  }

  // 공개 관리: 항목을 불러온 결과를 한 번 말한다(빈 목록·조회 실패를 '없음'으로 섞지 않는다).
  const shareStatus =
    flow.kind === 'share' && flow.elder
      ? shareFailed
        ? '공개 항목을 불러오지 못했어요. 공개 관리 화면에서 확인해 주세요.'
        : !shareLoaded
          ? '불러오는 중이에요…'
          : shareItems.length
            ? '공개하거나 비공개로 바꿀 항목을 골라 주세요.'
            : '공개할 수 있는 항목이 아직 없어요. 일지를 확정하거나 대화가 끝나면 생겨요.'
      : null;

  // ── 보기별 말풍선 ──
  const inboxItems: ChatItem[] = (() => {
    if (messages.isError) return [{ id: 'inbox-err', kind: 'text', from: 'bot', at: startedAt, text: '보호자 메시지를 불러오지 못했어요. (없다는 뜻이 아니에요)' }];
    if (!messages.data) return [{ id: 'inbox-loading', kind: 'text', from: 'bot', at: startedAt, text: '보호자 메시지를 불러오는 중이에요…' }];
    if (!threads.length) return [{ id: 'inbox-empty', kind: 'text', from: 'bot', at: startedAt, text: '담당 어르신의 보호자가 보낸 메시지가 아직 없어요.' }];
    return [{
      id: 'inbox', kind: 'card', at: startedAt,
      content: (
        <ul className="space-y-[10px]" aria-label="보호자 메시지 목록">
          {threads.map((t) => {
            const n = unreadOf(t);
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => openThread(t)}
                  className="w-full rounded-[16px] border border-line bg-white px-[20px] py-[14px] text-left shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:bg-accent-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-center justify-between gap-[10px] text-w-sub font-semibold leading-[26px] text-ink-900">
                    {threadTitle(t)}
                    {n ? <span className="rounded-full bg-accent px-[10px] text-[14px] font-bold leading-[24px] text-white">새 {n}</span> : null}
                  </span>
                  <span className="mt-[2px] block truncate text-w-sub leading-[26px] text-ink-700">{t.last.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ),
    }];
  })();

  const threadItems: ChatItem[] = (() => {
    if (!thread) return [];
    const out: ChatItem[] = [...thread.rows].reverse().map((m) => ({
      id: m.id, kind: 'text', at: m.created_at, text: m.body,
      from: m.sender_role === 'caregiver' ? 'me' : 'them',
    }));
    if (!thread.guardianId) out.push({ id: 'no-guardian', kind: 'text', from: 'them', at: now(), text: '보호자 계정이 없어 답장할 수 없어요.' });
    return out;
  })();

  const rendered: ChatItem[] = items.map((it) =>
    it.kind === 'confirm'
      ? {
          id: it.id, kind: 'card', at: it.at,
          content: it.spec.type === 'design'
            ? designCard(it.id, it.spec.draft)
            : it.spec.type === 'share'
              ? shareCard(it.id, it.spec.elder, it.spec.item, it.spec.shared)
              : replyCard(it.id, it.spec),
        }
      : it,
  );
  const aiItems: ChatItem[] = shareStatus && !openCard
    ? [...rendered, { id: 'share-status', kind: 'text', from: 'bot', at: lastItem?.at ?? startedAt, text: shareStatus }]
    : rendered;

  return (
    <AssistantWindow
      open={open}
      onOpen={() => setOpen(true)}
      onMinimize={() => setOpen(false)}
      onClose={() => {
        setOpen(false);
        setView('ai');
        setFlow({ kind: 'idle' });
        setText('');
        setStartedAt(now());
        setItems([greeting()]);
        setDoneCards(new Set());
      }}
      label={view === 'thread' && thread ? `${threadTitle(thread)} 메시지 대화창` : 'GIEOK-ON AI 대화창'}
      header={
        view === 'thread' && thread
          ? { avatar: asset.avatarDefault, title: `${(thread.guardianId && guardianName.get(thread.guardianId)) || '보호자'} 보호자`, subtitle: `${elderName.get(thread.profileId) ?? '어르신'} 어르신 · 보호자 메시지` }
          : { avatar: asset.chatbotFab, title: <WordmarkTitle />, subtitle: view === 'inbox' ? '보호자에게 온 메시지예요.' : '언제든 궁금한 점을 물어보세요.' }
      }
      botAvatar={view === 'thread' ? asset.avatarDefault : asset.chatbotFab}
      startedAt={startedAt}
      items={view === 'thread' ? threadItems : view === 'inbox' ? inboxItems : aiItems}
      chips={chips}
      input={{
        value: text,
        onChange: setText,
        onSubmit: submit,
        maxLength: view === 'thread' ? MESSAGE_MAX : 500,
        disabled: view === 'thread' && (!thread?.guardianId || !isConfigured),
        pending: reply.isPending,
        placeholder: view === 'thread' ? '보호자에게 보낼 답장을 입력해주세요.' : undefined,
      }}
    />
  );
}

function greeting(): ChatItem {
  return { id: nextId(), kind: 'text', from: 'bot', text: CAREGIVER_GREETING, at: now() };
}
