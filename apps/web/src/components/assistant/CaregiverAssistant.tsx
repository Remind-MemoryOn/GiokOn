// 요양보호사 플로팅 대화창 — 규칙 기반 업무 도우미 + 보호자 메시지(2026-11-04 사용자 결정).
//
// 업무 4가지: 대화 세션 설계 · 공개 관리 · 보호자 메시지 확인·답장 · 확인할 일 안내.
// ⛔ 대화로 모은 값은 **확인 카드**를 거쳐 사람이 '확인'을 눌러야 실행한다. 실행 경로는 기존 화면과 같다
//    (세션 설계 = `useCreateSession` status 'planned' · 공개 = `guardian_shares` 생성/철회 — 확정·문장 승인·철회 권한은
//    서버가 그대로 판정한다). 일지 확정·위기 확인은 여기서 하지 않고 해당 화면으로 안내한다.
// 공개는 항목의 **요약 줄**(일지 = 보호자 문장 · 대화 = 요약)만 켠다. 사진·AI 분석까지 고르는 세부 설정은 공개 관리 화면.
// 비공개 전환은 공개 관리 화면과 같이 그 항목에 걸린 공개 전부(사진·AI 분석 포함)를 내린다.
import { useMemo, useState } from 'react';
import {
  applyPlanAnswer,
  CAREGIVER_GREETING,
  CAREGIVER_TASKS,
  dateDot,
  detectCaregiverTask,
  isCancel,
  matchElder,
  nextPlanStep,
  planPatch,
  planQuestion,
  planSummary,
  seoulDate,
  SESSION_MAX_MINUTES,
  type CaregiverTask,
  type ElderChoice,
  type PlanDraft,
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
  | { id: string; kind: 'confirm'; at: string; spec: { type: 'design'; draft: PlanDraft } | { type: 'share'; elder: ElderChoice; item: ShareItem; shared: boolean } };

type Flow =
  | { kind: 'idle' }
  | { kind: 'design'; draft: PlanDraft; candidates?: ElderChoice[] }
  | { kind: 'share'; elder?: ElderChoice; candidates?: ElderChoice[] };

interface ShareItem {
  type: 'journal' | 'analysis';
  id: string;
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
  function start(task: CaregiverTask, typed?: string) {
    if (typed) say(mine(typed));
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
    // 첫 말에 어르신 이름이 들어 있으면 바로 고른다(예: "박희수 어르신 세션 설계").
    const hits = typed ? elders.filter((e) => typed.replace(/\s/g, '').includes(e.name.replace(/\s/g, ''))) : [];
    const elder = hits.length === 1 ? hits[0] : undefined;
    if (task === 'design') {
      const draft: PlanDraft = elder ? { elder } : {};
      setFlow({ kind: 'design', draft });
      say(bot(planQuestion(nextPlanStep(draft), draft, { defaultAvoid })));
    } else {
      setFlow({ kind: 'share', elder });
      say(bot(elder ? `${elder.name} 어르신의 공개할 수 있는 항목을 불러올게요.` : '어느 어르신의 공개를 관리할까요? 성함을 말씀해 주세요.'));
    }
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
    const step = nextPlanStep(r.draft);
    setFlow({ kind: 'design', draft: r.draft });
    if (step !== 'confirm') {
      say(bot(planQuestion(step, r.draft, { defaultAvoid })));
      return;
    }
    say(bot(planQuestion('confirm', r.draft, { defaultAvoid })), {
      id: nextId(), kind: 'confirm', at: now(), spec: { type: 'design', draft: r.draft },
    });
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
              onError: (e) => { setPendingCard(null); say(bot(`저장하지 못했어요. ${e.message}`)); },
            },
          );
        }}
      />
    );
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
  const shareItems = useMemo<ShareItem[]>(() => {
    const out: (ShareItem & { at: string })[] = [];
    for (const j of journals.data ?? []) {
      if (j.status !== 'final') continue;
      out.push({
        type: 'journal', id: j.id, at: j.journal_date,
        title: `${dateDot(j.journal_date)} 프로그램 일지`,
        body: j.guardian_text_approved_at && j.guardian_text ? j.guardian_text : '보호자 문장이 아직 승인되지 않았어요.',
        ready: Boolean(j.guardian_text_approved_at && j.guardian_text),
      });
    }
    for (const row of analyses.data ?? []) {
      const a = parseSessionAnalysis(row);
      if (!a) continue;
      out.push({
        type: 'analysis', id: row.id, at: row.created_at,
        title: `${dateDot(row.created_at)} AI 회상 대화 요약`, body: a.summary, ready: true,
      });
    }
    return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 8);
  }, [journals.data, analyses.data]);
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

  function pickShareItem(item: ShareItem) {
    const elder = flow.kind === 'share' ? flow.elder : undefined;
    if (!elder) return;
    const live = liveSharesOf(item);
    const shared = live.length > 0;
    say(mine(item.title));
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
    if (isCancel(value) && flow.kind !== 'idle') {
      say(mine(value), bot('진행하던 일을 취소했어요. 무엇을 할까요?'));
      setFlow({ kind: 'idle' });
      return;
    }
    if (flow.kind === 'design') {
      say(mine(value));
      designAnswer(flow.draft, value);
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
    const task = detectCaregiverTask(value);
    if (task) {
      start(task, value);
      return;
    }
    say(mine(value), bot('제가 도와드릴 수 있는 일은 아래 네 가지예요. 골라 주세요.'));
  }

  // ── 칩 ──
  const elderChips = (list: ElderChoice[], pick: (e: ElderChoice) => void): ChatChip[] =>
    list.slice(0, 8).map((e) => ({ label: `${e.name} 어르신`, onClick: () => { say(mine(`${e.name} 어르신`)); pick(e); } }));

  // 확인 카드가 결정을 기다리면 칩을 숨긴다(카드 버튼으로 정한다 — 다른 일로 새지 않게).
  const lastItem = items[items.length - 1];
  const openCard = lastItem?.kind === 'confirm' && !doneCards.has(lastItem.id);

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
        chips = shareItems.map((it) => {
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
          content: it.spec.type === 'design' ? designCard(it.id, it.spec.draft) : shareCard(it.id, it.spec.elder, it.spec.item, it.spec.shared),
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
