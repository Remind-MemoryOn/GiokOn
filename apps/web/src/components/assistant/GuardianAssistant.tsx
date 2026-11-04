// 보호자 플로팅 대화창 — 시안 '대화창 ai.png'(AI) · '대화창 요양보호사.png'(담당 요양보호사와 주고받기).
//
// AI 는 규칙 기반이다(core `answerGuardian` — 모델 호출 없음). 답할 수 없거나 직접 묻고 싶으면
// 담당 요양보호사에게 메시지를 보낸다(기존 `messages` — 2026-11-04 양방향: 답장이 이 창에 보인다).
// ⚠️ 시안의 요양보호사 이름·사진·'지금 접속 중이에요'는 보호자가 읽을 수 있는 데이터가 없다 →
//    지어내지 않고 '담당 요양보호사'로 적는다(자리표시자 금지).
import { useMemo, useState } from 'react';
import {
  answerGuardian,
  GUARDIAN_FAQ,
  GUARDIAN_GREETING,
  GUARDIAN_HANDOFF,
  GUARDIAN_UNKNOWN,
} from '@giokon/core';
import { useMessages, useSendMessage } from '@giokon/data';
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

  const { link } = useGuardianElder();
  const profileId = link?.profile_id;
  const thread = useMessages(profileId, { enabled: isConfigured && open && mode === 'thread' });
  const send = useSendMessage();

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
    } else if (a.kind === 'handoff') {
      say(mine);
      setMode('thread');
    } else {
      say(mine, { id: nextId(), kind: 'text', from: 'bot', text: GUARDIAN_UNKNOWN, at });
    }
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

  const chips: ChatChip[] =
    mode === 'ai'
      ? [
          ...GUARDIAN_FAQ.slice(0, 4).map((f) => ({ label: f.question, onClick: () => ask(f.question) })),
          { label: '요양보호사에게 문의하기', onClick: () => { say({ id: nextId(), kind: 'text', from: 'bot', text: GUARDIAN_HANDOFF, at: now() }); setMode('thread'); } },
        ]
      : [{ label: 'AI에게 물어보기', onClick: () => setMode('ai') }];

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
      onClose={() => {
        setOpen(false);
        setMode('ai');
        setText('');
        setStartedAt(now());
        setItems([{ id: nextId(), kind: 'text', from: 'bot', text: GUARDIAN_GREETING, at: now() }]);
      }}
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
