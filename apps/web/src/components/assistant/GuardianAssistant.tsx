// 보호자 플로팅 대화창 — 시안 '대화창 ai.png'(AI) · '대화창 요양보호사.png'(담당 요양보호사와 주고받기).
//
// AI 는 규칙 기반이다(core `answerGuardian` — 모델 호출 없음). 답할 수 없거나 직접 묻고 싶으면
// 담당 요양보호사에게 메시지를 보낸다(기존 `messages` — 2026-11-04 양방향: 답장이 이 창에 보인다).
// ⚠️ 시안의 요양보호사 이름·사진·'지금 접속 중이에요'는 보호자가 읽을 수 있는 데이터가 없다 →
//    지어내지 않고 '담당 요양보호사'로 적는다(자리표시자 금지).
// 버튼은 답에 따라 바뀐다(core `followUps`): 기록 → 최근 공개된 소식 · 분석 → 최근 대화 분석 · 언제나 '다른 질문 보기'.
// '최근 …' 은 보호자 화면이 쓰는 데이터 그대로(공개된 소식 = useMySharedContent · 분석 = 끝난 세션)로 가장 최근 것을 연다.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  answerGuardian,
  GUARDIAN_FAQ,
  GUARDIAN_FOLLOW_UP_LABEL,
  GUARDIAN_GREETING,
  GUARDIAN_HANDOFF,
  GUARDIAN_MORE,
  GUARDIAN_UNKNOWN,
  GUARDIAN_UNKNOWN_FOLLOW_UPS,
  latestEndedSession,
  type GuardianFollowUp,
} from '@giokon/core';
import { useMessages, useMySharedContent, useSendMessage, useSessions } from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useGuardianElder } from '../../lib/guardianElder';
import { AssistantWindow, type ChatChip, type ChatItem } from './AssistantWindow';

/** 본문 최대 길이 — DB 제약(messages_body_check)과 같은 값이다. */
const MESSAGE_MAX = 1000;
const MESSAGE_NOTICE =
  '담당 요양보호사에게 보내는 메시지예요.\n활동·기록 관련 문의만 보내 주세요.\n주고받은 내용과 전송 시간은 자동으로 기록돼요.';

let seq = 0;
const nextId = () => `g${++seq}`;
const now = () => new Date().toISOString();

function WordmarkTitle() {
  return (
    <>
      <img src={asset.wordmark} alt="GIEOK-ON" className="h-[20px] w-auto brightness-0" />
      <span>AI</span>
    </>
  );
}

export function GuardianAssistant() {
  const { isConfigured, userRow } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'thread'>('ai');
  const [startedAt, setStartedAt] = useState(now);
  const [text, setText] = useState('');
  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: nextId(), kind: 'text', from: 'bot', text: GUARDIAN_GREETING, at: now() },
  ]);
  /** 지금 보일 버튼 묶음 — 처음 · 질문 전체 · 직전 답의 후속 버튼. */
  const [menu, setMenu] = useState<'start' | 'all' | readonly GuardianFollowUp[]>('start');
  const navigate = useNavigate();

  const { link } = useGuardianElder();
  const profileId = link?.profile_id;
  const thread = useMessages(profileId, { enabled: isConfigured && open && mode === 'thread' });
  const send = useSendMessage();
  const shared = useMySharedContent({ enabled: isConfigured && open });
  const sessions = useSessions(isConfigured && open ? profileId : undefined);

  const say = (...add: ChatItem[]) => setItems((prev) => [...prev, ...add]);

  function ask(question: string) {
    const at = now();
    const mine: ChatItem = { id: nextId(), kind: 'text', from: 'me', text: question, at };
    const a = answerGuardian(question);
    if (a.kind === 'faq') {
      say(mine, {
        id: nextId(), kind: 'text', from: 'bot', text: a.faq.answer, at,
        links: a.faq.link ? [a.faq.link] : undefined,
      });
      setMenu(a.faq.followUps);
    } else if (a.kind === 'handoff') {
      say(mine);
      setMode('thread');
    } else {
      say(mine, { id: nextId(), kind: 'text', from: 'bot', text: GUARDIAN_UNKNOWN, at });
      setMenu(GUARDIAN_UNKNOWN_FOLLOW_UPS);
    }
  }

  const bot = (text: string, links?: { label: string; to: string }[]): ChatItem =>
    ({ id: nextId(), kind: 'text', from: 'bot', text, at: now(), links });

  /** 지금 보는 어르신에게 가장 최근 공개된 항목의 화면(소식 화면과 같은 규칙 — 원본이 없으면 건너뛴다). */
  function latestFeedTarget(): string | null {
    const d = shared.data;
    if (!d || !profileId) return null;
    const journals = new Set(d.journals.map((j) => j.id));
    const analyses = new Set(d.analyses.map((a) => a.id));
    const summaries = new Set(d.summaries.filter((m) => m.summary).map((m) => m.id));
    const photos = new Set(d.photos.map((p) => p.id));
    const rows = d.shares
      .filter((sh) => !sh.revoked_at && sh.profile_id === profileId)
      .sort((x, y) => y.shared_at.localeCompare(x.shared_at));
    for (const sh of rows) {
      if (sh.item_type === 'journal' && journals.has(sh.item_id)) return `/guardian/feed/journal/${sh.item_id}`;
      if ((sh.item_type === 'analysis' && analyses.has(sh.item_id)) || (sh.item_type === 'session_summary' && summaries.has(sh.item_id))) {
        return `/guardian/feed/summary/${sh.item_id}`;
      }
      if (sh.item_type === 'photo' && photos.has(sh.item_id)) return '/guardian/feed?tab=photo';
    }
    return null;
  }

  /** 가장 최근 끝난 대화(보호자에게 보이는 세션 = 공개된 분석이 매달린 것)의 분석 화면. */
  function latestAnalysisTarget(): string | null {
    const latest = latestEndedSession(sessions.data ?? []);
    return latest ? `/guardian/analysis/sessions/${latest.id}` : null;
  }

  function followUp(f: GuardianFollowUp) {
    const label = GUARDIAN_FOLLOW_UP_LABEL[f];
    const mine: ChatItem = { id: nextId(), kind: 'text', from: 'me', text: label, at: now() };
    if (f === 'handoff') {
      say(mine, bot(GUARDIAN_HANDOFF));
      setMode('thread');
      return;
    }
    if (f === 'more') {
      say(mine, bot(GUARDIAN_MORE));
      setMenu('all');
      return;
    }
    const feed = f === 'latest_feed';
    const query = feed ? shared : sessions;
    if (!profileId) {
      say(mine, bot('어르신 연결이 승인된 뒤에 볼 수 있어요.', [{ label: '어르신 연결로 가기', to: '/guardian' }]));
    } else if (query.isError) {
      say(mine, bot('불러오지 못했어요. 잠시 뒤 다시 눌러 주세요. (없다는 뜻이 아니에요)'));
    } else if (!query.data) {
      say(mine, bot('불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.'));
    } else {
      const to = feed ? latestFeedTarget() : latestAnalysisTarget();
      if (to) {
        say(mine, bot(feed ? '가장 최근에 공개된 소식을 열었어요.' : '가장 최근 대화의 분석을 열었어요.', [
          { label: feed ? '공개된 소식 전체 보기' : '대화 분석 목록 보기', to: feed ? '/guardian/feed' : '/guardian/analysis/sessions' },
        ]));
        navigate(to);
      } else {
        say(mine, feed
          ? bot('아직 공개된 소식이 없어요. 요양보호사가 확인·공개하면 여기서 볼 수 있어요.', [{ label: '공개된 소식 보기', to: '/guardian/feed' }])
          : bot('아직 볼 수 있는 대화 분석이 없어요. 요양보호사가 공개하면 볼 수 있어요.', [{ label: '분석 보기', to: '/guardian/analysis' }]));
      }
    }
    setMenu(['more']);
  }

  // 담당 요양보호사와 주고받은 메시지(오래된 것부터). RLS 가 내가 보낸 것과 나에게 온 답장만 준다.
  const threadItems = useMemo<ChatItem[]>(() => {
    const rows = [...(thread.data ?? [])].reverse();
    const out: ChatItem[] = [{ id: 'notice', kind: 'text', from: 'them', text: MESSAGE_NOTICE, at: startedAt }];
    if (!profileId) {
      out.push({
        id: 'no-link', kind: 'text', from: 'them', at: startedAt,
        text: '어르신 연결이 승인된 뒤에 메시지를 보낼 수 있어요.',
        links: [{ label: '어르신 연결로 가기', to: '/guardian' }],
      });
      return out;
    }
    if (thread.isError) {
      out.push({ id: 'err', kind: 'text', from: 'them', at: startedAt, text: '메시지를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' });
    }
    for (const m of rows) {
      out.push({
        id: m.id, kind: 'text', at: m.created_at, text: m.body,
        from: m.sender_role === 'caregiver' ? 'them' : 'me',
      });
    }
    return out;
  }, [thread.data, thread.isError, profileId, startedAt]);

  const question = (f: (typeof GUARDIAN_FAQ)[number]): ChatChip => ({ label: f.question, onClick: () => ask(f.question) });
  const action = (f: GuardianFollowUp): ChatChip => ({ label: GUARDIAN_FOLLOW_UP_LABEL[f], onClick: () => followUp(f) });
  const chips: ChatChip[] =
    mode !== 'ai'
      ? [{ label: 'AI에게 물어보기', onClick: () => setMode('ai') }]
      : menu === 'start'
        ? [...GUARDIAN_FAQ.slice(0, 4).map(question), action('more'), action('handoff')]
        : menu === 'all'
          ? [...GUARDIAN_FAQ.map(question), action('handoff')]
          : menu.map(action);

  function submit() {
    const body = text.trim();
    if (!body) return;
    if (mode === 'ai') {
      setText('');
      ask(body);
      return;
    }
    if (!profileId || !userRow?.id) return;
    send.mutate(
      { profileId, senderUserId: userRow.id, body },
      {
        onSuccess: () => setText(''),
        onError: () => say({ id: nextId(), kind: 'text', from: 'them', at: now(), text: '메시지를 보내지 못했어요. 연결 상태를 확인하고 다시 보내 주세요.' }),
      },
    );
  }

  const inThread = mode === 'thread';
  return (
    <AssistantWindow
      open={open}
      onOpen={() => setOpen(true)}
      onMinimize={() => setOpen(false)}
      // 닫기 = 한 단계 위로: 요양보호사 메시지 → AI 대화(주고받던 AI 대화는 그대로) ·
      // AI 대화에서는 창을 닫고 처음으로 되돌린다(최소화는 그대로 둔다 — 2026-11-06 사용자 결정).
      onClose={() => {
        setText('');
        if (inThread) {
          setMode('ai');
          return;
        }
        setOpen(false);
        setMenu('start');
        setStartedAt(now());
        setItems([{ id: nextId(), kind: 'text', from: 'bot', text: GUARDIAN_GREETING, at: now() }]);
      }}
      closeLabel={inThread ? '닫고 AI 대화로 돌아가기' : '대화창 닫기'}
      label={inThread ? '담당 요양보호사 메시지 대화창' : 'GIEOK-ON AI 대화창'}
      header={
        inThread
          ? { avatar: asset.avatarDefault, title: '담당 요양보호사', subtitle: '보내신 메시지는 담당 요양보호사가 확인해요.' }
          : { avatar: asset.chatbotFab, title: <WordmarkTitle />, subtitle: '언제든 궁금한 점을 물어보세요.' }
      }
      botAvatar={inThread ? asset.avatarDefault : asset.chatbotFab}
      startedAt={startedAt}
      items={inThread ? threadItems : items}
      chips={chips}
      input={{
        value: text,
        onChange: setText,
        onSubmit: submit,
        maxLength: inThread ? MESSAGE_MAX : 200,
        disabled: inThread && (!profileId || !isConfigured),
        pending: send.isPending,
      }}
    />
  );
}
