// 플로팅 대화창 공용 틀 — 사용자 제공 시안(2026-11-04 '대화창 ai.png' · '대화창 요양보호사.png', @2x 1356×2000)
//   카드 654×972(화면 높이에 맞춰 줄어든다) · r20 · 그림자 · 헤더 154 #fef4ec
//   아바타 75 @(44,44) · 제목 Bold 26 @(136.5,51) · 부제 18 · 최소화/닫기 @우측 95·54
//   날짜 알약 37 #f2f1f1 · AI 말풍선 흰색 r20 그림자(4.png) @x131.5 최대 320 · 아바타 64 @x45
//   보낸 말풍선 accent/20 r20(오른쪽 위 각진) 오른끝 54 · 시각 18 회색 · 입력 72 #f7f6f9 r16 · 전송 86×48 accent
// Figma 노드가 없는 화면이라 figma-audit 표에 넣지 않았다(시안 PNG 실측). 버튼 아이콘 = 'Group 561.png'.
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { asset } from '../../assets/ui';
import { cn } from '../../lib/utils';
import { dateLabel, timeLabel } from '../../lib/chatTime';

export interface ChatChip {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export type ChatItem =
  | {
      id: string;
      kind: 'text';
      /** bot·them = 왼쪽(아바타), me = 오른쪽. */
      from: 'bot' | 'them' | 'me';
      text: string;
      at: string;
      links?: { label: string; to: string }[];
    }
  | { id: string; kind: 'card'; at: string; content: ReactNode };

function DatePill({ iso }: { iso: string }) {
  return (
    <li className="flex justify-center">
      <span className="rounded-full bg-mute px-[30px] py-[4px] text-w-sub leading-[29px] text-ink-900">{dateLabel(iso)}</span>
    </li>
  );
}

function Avatar({ src, size }: { src: string; size: number }) {
  return <img src={src} alt="" aria-hidden width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
}

function Bubble({ item, avatar }: { item: Extract<ChatItem, { kind: 'text' }>; avatar: string }) {
  const mine = item.from === 'me';
  const time = (
    <span className="mb-[2px] shrink-0 whitespace-nowrap text-w-sub leading-[22px] text-ink-500">{timeLabel(item.at)}</span>
  );
  const body = (
    <div
      className={cn(
        'max-w-[320px] whitespace-pre-line break-keep [overflow-wrap:anywhere] px-[35px] py-[24px] text-w-body leading-[32px] text-ink-900',
        mine
          ? 'rounded-[20px] rounded-tr-none bg-accent-soft shadow-[0_3px_8px_rgba(0,0,0,0.08)]'
          : 'rounded-[20px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.14)]',
      )}
    >
      {item.text}
      {item.links?.length ? (
        <span className="mt-[8px] flex flex-col gap-[4px]">
          {item.links.map((l) => (
            <Link key={l.to + l.label} to={l.to} className="text-w-sub font-semibold leading-[28px] text-accent underline underline-offset-4">
              {l.label}
            </Link>
          ))}
        </span>
      ) : null}
    </div>
  );
  if (mine) {
    return (
      <li className="flex items-end justify-end gap-[14px] pr-[54px]">
        {time}
        {body}
      </li>
    );
  }
  return (
    <li className="flex items-start gap-[22px] pl-[45px] pr-[24px]">
      <Avatar src={avatar} size={64} />
      <div className="flex min-w-0 items-end gap-[14px]">
        {body}
        {time}
      </div>
    </li>
  );
}

export function AssistantWindow({
  open,
  onOpen,
  onMinimize,
  onClose,
  label,
  header,
  startedAt,
  items,
  chips,
  botAvatar,
  input,
}: {
  open: boolean;
  onOpen: () => void;
  onMinimize: () => void;
  onClose: () => void;
  /** 창의 접근성 이름(예: 'GIEOK-ON AI 대화창'). */
  label: string;
  header: { avatar: string; title: ReactNode; subtitle: ReactNode };
  startedAt: string;
  items: ChatItem[];
  chips?: ChatChip[];
  /** 왼쪽 말풍선 아바타(AI 로봇 또는 상대방). */
  botAvatar: string;
  input: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    disabled?: boolean;
    maxLength?: number;
    pending?: boolean;
  };
}) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 새 말이 오면 맨 아래로.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, chips?.length, open]);

  // 열리면 입력칸으로 초점 · Esc 는 최소화(대화는 남는다).
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMinimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onMinimize]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        // 버튼 이름은 보던 화면(스레드 등)과 상관없이 같다 — 다시 찾을 수 있게.
        aria-label="GIEOK-ON AI 대화창 열기"
        className="fixed bottom-[32px] right-[32px] z-40 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.18)] focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
      >
        <img src={asset.chatbotFab} alt="" aria-hidden width={77} height={77} className="h-[77px] w-[77px]" />
      </button>
    );
  }

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.disabled || input.pending || !input.value.trim()) return;
    input.onSubmit();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className="fixed bottom-[32px] right-[32px] z-40 flex w-[654px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.18)]"
      style={{ height: 'min(972px, calc(100vh - 64px))' }}
    >
      <div className="relative h-[154px] shrink-0 bg-[#fef4ec] shadow-[0_3px_6px_rgba(0,0,0,0.05)]">
        <img src={header.avatar} alt="" aria-hidden width={75} height={75} className="absolute left-[44px] top-[44px] h-[75px] w-[75px] rounded-full object-cover" />
        <div className="absolute left-[136.5px] top-[51px] right-[130px]">
          <h2 className="flex items-center gap-[12px] text-[26px] font-bold leading-[32px] text-ink-900">{header.title}</h2>
          <div className="mt-[8px] truncate text-w-sub leading-[28px] text-ink-700">{header.subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="대화창 최소화"
          className="absolute right-[86px] top-[44px] flex h-[40px] w-[40px] items-center justify-center rounded-[8px] hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden className="block h-[3px] w-[22px] rounded-full bg-[#7f7f7f]" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="대화창 닫기"
          className="absolute right-[44px] top-[44px] flex h-[40px] w-[40px] items-center justify-center rounded-[8px] hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <img src={asset.iconCloseSm} alt="" aria-hidden className="h-[18.5px] w-[18.5px]" />
        </button>
      </div>

      <ol ref={listRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-[30px] overflow-y-auto pb-[24px] pt-[36px]">
        {items.length === 0 ? <DatePill iso={startedAt} /> : null}
        {items.map((item, i) => {
          // 날짜가 바뀌는 곳마다 날짜 알약을 넣는다(지난 메시지가 오늘처럼 보이지 않게).
          const day = dateLabel(item.at);
          const newDay = i === 0 || dateLabel(items[i - 1].at) !== day;
          return (
            <Fragment key={item.id}>
              {newDay ? <DatePill iso={item.at} /> : null}
              {item.kind === 'text' ? (
                <Bubble item={item} avatar={botAvatar} />
              ) : (
                <li className="pl-[131.5px] pr-[54px]">{item.content}</li>
              )}
            </Fragment>
          );
        })}
        {chips?.length ? (
          <li className="flex flex-wrap gap-[10px] pl-[131.5px] pr-[54px]" aria-label="빠른 선택">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={c.disabled}
                onClick={c.onClick}
                className="rounded-full border border-accent bg-white px-[18px] py-[6px] text-w-sub font-medium leading-[26px] text-ink-900 hover:bg-accent-tint disabled:cursor-not-allowed disabled:border-line disabled:text-ink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {c.label}
              </button>
            ))}
          </li>
        ) : null}
      </ol>

      <form onSubmit={send} className="mx-[54px] mb-[35px] ml-[45px] flex h-[72px] shrink-0 items-center gap-[12px] rounded-[16px] bg-[#f7f6f9] pl-[44px] pr-[36px]">
        <label htmlFor="assistant-input" className="sr-only">메시지</label>
        <textarea
          id="assistant-input"
          rows={1}
          value={input.value}
          maxLength={input.maxLength}
          disabled={input.disabled}
          onChange={(e) => input.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
          }}
          placeholder={input.placeholder ?? '메시지를 입력해주세요.'}
          className="h-[30px] min-w-0 flex-1 resize-none bg-transparent text-w-body leading-[30px] text-ink-900 placeholder:text-ink-500 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={input.disabled || input.pending || !input.value.trim()}
          className="h-[48px] w-[86px] shrink-0 rounded-[14px] bg-accent text-w-body font-bold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
        >
          전송
        </button>
      </form>
    </div>
  );
}

/** 확인 카드 — 사람이 '확인'을 눌러야 실행된다(AI 산출물이 사람 확인 없이 기록·공개되지 않는다). */
export function ConfirmCard({
  title,
  rows,
  confirmLabel = '확인',
  onConfirm,
  onCancel,
  pending,
  done,
}: {
  title: string;
  rows: [string, string][];
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  /** 실행했거나 취소된 카드는 버튼을 잠근다(같은 카드로 두 번 실행하지 않게). */
  done?: boolean;
}) {
  return (
    <div className="max-w-[420px] rounded-[20px] border border-line bg-white px-[28px] py-[22px] shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
      <p className="text-w-body font-semibold leading-[30px] text-ink-900">{title}</p>
      <dl className="mt-[10px] space-y-[4px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-[12px] text-w-sub leading-[26px]">
            <dt className="w-[92px] shrink-0 text-ink-500">{k}</dt>
            <dd className="min-w-0 whitespace-pre-line break-keep [overflow-wrap:anywhere] text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-[16px] flex justify-end gap-[10px]">
        <button
          type="button"
          disabled={pending || done}
          onClick={onCancel}
          className="h-[44px] rounded-[10px] border border-line-mid px-[20px] text-w-sub font-semibold text-ink-700 disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          disabled={pending || done}
          onClick={onConfirm}
          className="h-[44px] rounded-[10px] bg-accent px-[20px] text-w-sub font-bold text-white disabled:opacity-50"
        >
          {pending ? '처리 중…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
