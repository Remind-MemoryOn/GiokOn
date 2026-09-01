// 보호자 — 메시지 이용 안내 모달 (Figma 69:195 · 카드 868×758, 프레임은 705 에서 잘려 있다)
//   제목 Bold 25/30 @(74,60) · 안내 Regular 20 @(74,113)
//   소제목 SemiBold 22 @(74, 187|336|453) · 본문 Regular 20/35 @(74, 225|374|491)
//   체크박스 35 @(74,600) · 라벨 SemiBold 22 @(121,607)
//
// ⚠️ 시안 프레임(705)이 카드 사각형(758)보다 짧아 아래가 잘려 있다 — 확인 버튼이 잘려 나간
//    것으로 보고 카드는 758 로 그리고 버튼을 되살렸다(그 밖의 요소는 시안 그대로).
// ⚠️ **작성 화면은 Figma 에 없다**. 시안은 "메시지 보내기" 버튼과 이 이용 안내까지만 그렸고
//    ("보내기 전 아래 내용을 확인해 주세요"), 그 다음 단계를 그려 두지 않았다 → 안내 뒤에
//    같은 모달 언어(카드 r10 · 라벨 SemiBold 22 · 버튼 57)로 **최소 작성 폼**을 잇는다.
//    시안이 생기면 이 두 번째 단계만 교체하면 된다(안내 단계는 실측 그대로다).
import { useState } from 'react';
import {
  useSendMessage,
  type MessageRow,
} from '@giokon/data';
import { asset } from '../assets/ui';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Field, Textarea } from './ui/Input';

/** 본문 3종 — 소제목 top · 본문 top · 줄. */
const SECTIONS = [
  {
    fxHead: '55:1287', head: '활동 및 오류 관련 문의만 보내주세요', headTop: 187,
    fxBody: '55:1289', bodyTop: 225,
    body: '어르신의 요양일지, AI 대화 기록 등 활동 및 오류 관련된 문의를 위한 메시지 기능입니다.\n개인적인 연락이나 서비스와 관련 없는 내용은 삼가 주세요.',
  },
  {
    fxHead: '55:1291', head: '메시지 내용은 자동으로 기록됩니다', headTop: 336,
    fxBody: '55:1292', bodyTop: 374,
    body: '원활한 소통과 기록 관리를 위해 주고받은 메시지 내용과 전송 시간이 자동으로 저장됩니다.',
  },
] as const;

/** 본문 최대 길이 — DB 제약(messages_body_check)과 같은 값이다. */
const MAX = 1000;

export function MessageNoticeDialog({
  open,
  onClose,
  profileId,
  senderUserId,
}: {
  open: boolean;
  onClose: () => void;
  /** 어느 어르신에 대한 문의인가. 없으면(연결 전) 안내만 보여 준다. */
  profileId?: string;
  /** 보내는 보호자. 없으면 안내만 보여 준다. */
  senderUserId?: string;
}) {
  const [ack, setAck] = useState(false);
  const [step, setStep] = useState<'notice' | 'compose'>('notice');
  const canSend = Boolean(profileId && senderUserId);

  function close() {
    setStep('notice');
    setAck(false);
    onClose();
  }

  if (open && step === 'compose' && profileId && senderUserId) {
    return (
      <ComposeDialog
        profileId={profileId}
        senderUserId={senderUserId}
        onBack={() => setStep('notice')}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onClose={close} size="lg">
      <div
        data-fx="69:195"
        className="relative mx-auto rounded-[10px] border border-line bg-white"
        style={{ width: 868, height: 758 }}
      >
        <h2
          data-fx="55:1285"
          className="absolute whitespace-nowrap text-[25px] font-bold leading-[30px] text-ink-900"
          style={{ left: 74, top: 60 }}
        >
          「메시지 이용 안내」
        </h2>
        <p
          data-fx="55:1279"
          className="absolute whitespace-nowrap text-w-body leading-[22px] text-ink-900"
          style={{ left: 74, top: 113 }}
        >
          담당 요양보호사(관리자)에게 메시지를 보내기 전 아래 내용을 확인해 주세요.
        </p>

        {SECTIONS.map((s) => (
          <div key={s.fxHead}>
            <p
              data-fx={s.fxHead}
              className="absolute whitespace-nowrap text-[22px] font-semibold leading-[24px] text-ink-900"
              style={{ left: 74, top: s.headTop }}
            >
              {s.head}
            </p>
            <p
              data-fx={s.fxBody}
              className="absolute whitespace-pre text-w-body text-ink-900"
              style={{ left: 74, top: s.bodyTop, lineHeight: '35px' }}
            >
              {s.body}
            </p>
          </div>
        ))}

        <p
          data-fx="55:1294"
          className="absolute whitespace-nowrap text-[22px] font-semibold leading-[24px] text-ink-900"
          style={{ left: 74, top: 453 }}
        >
          문의 가능 시간을 확인해 주세요
        </p>
        <p
          data-fx="55:1295"
          className="absolute whitespace-pre text-w-body text-ink-900"
          style={{ left: 74, top: 491, lineHeight: '35px' }}
        >
          메시지 문의 가능 시간은
          <span className="font-semibold"> 평일 오전 9:00 ~ 오후 18:00</span>
          입니다. 문의 시간 외에 보낸 메시지는{'\n'}담당 요양보호사의 근무 시간에 확인되며, 즉시 답변이 어려울 수 있습니다.
        </p>

        <button
          type="button"
          onClick={() => setAck((v) => !v)}
          aria-pressed={ack}
          className="absolute flex items-center"
          style={{ left: 74, top: 600 }}
        >
          {/* 체크박스 틀은 Figma 에셋 그대로(35) — 선택 표시는 안쪽 accent 사각형 */}
          <span data-fx="55:1299" className="relative block" style={{ width: 35, height: 35 }}>
            <img src={asset.iconCheckbox} alt="" width={35} height={35} className="block" />
            {ack ? <span className="absolute inset-[8px] rounded-[3px] bg-accent" /> : null}
          </span>
          <span
            data-fx="55:1302"
            className="absolute whitespace-nowrap text-[22px] font-semibold leading-[24px] text-ink-900"
            style={{ left: 47, top: 7 }}
          >
            내용 확인했습니다.
          </span>
        </button>

        <div className="absolute" style={{ left: 636, top: 665 }}>
          <Button
            variant="primary"
            disabled={!ack}
            onClick={() => (canSend ? setStep('compose') : close())}
            className="h-[57px] w-[158px]"
          >
            확인
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * 메시지 작성 — **Figma 에 없는 단계**(위 주석 참조). 안내를 읽고 확인한 뒤에만 열린다.
 * 보낸 뒤에는 고칠 수 없다(append-only) — 안내가 약속한 "자동 저장" 을 스키마가 지킨다.
 */
function ComposeDialog({
  profileId,
  senderUserId,
  onBack,
  onClose,
}: {
  profileId: string;
  senderUserId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<MessageRow | null>(null);
  const send = useSendMessage();
  const text = body.trim();

  return (
    <Dialog open onClose={onClose} size="lg">
      <div
        className="relative mx-auto rounded-[10px] border border-line bg-white"
        style={{ width: 868, padding: '60px 74px' }}
      >
        <h2 className="text-[25px] font-bold leading-[30px] text-ink-900">메시지 보내기</h2>

        {sent ? (
          <>
            <p className="mt-6 text-w-body leading-[35px] text-ink-900" style={{ wordBreak: 'keep-all' }}>
              담당 요양보호사에게 전달했어요. 근무 시간에 확인하며, 보낸 내용과 시간은 기록으로
              남습니다.
            </p>
            <div className="mt-8 flex justify-end">
              <Button variant="primary" onClick={onClose} className="h-[57px] w-[158px]">
                닫기
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-w-sub leading-[28px] text-ink-500" style={{ wordBreak: 'keep-all' }}>
              문의 가능 시간은 평일 오전 9:00 ~ 오후 18:00 입니다. 보낸 메시지는 수정하거나 지울 수
              없습니다.
            </p>
            <div className="mt-8">
              <Field label="내용" required counter={`${text.length}/${MAX}`}>
                <Textarea
                  value={body}
                  maxLength={MAX}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="어르신의 요양일지·회상 대화 기록에 대해 궁금한 점을 적어주세요."
                  className="min-h-[220px]"
                />
              </Field>
            </div>
            {send.isError ? (
              <p role="alert" className="mt-3 text-w-sub text-alert">
                보내지 못했어요. 잠시 후 다시 시도해 주세요.
              </p>
            ) : null}
            <div className="mt-8 flex justify-end gap-4">
              <Button variant="outline" onClick={onBack} className="h-[57px] w-[158px]">
                이전
              </Button>
              <Button
                variant="primary"
                disabled={text.length === 0 || send.isPending}
                onClick={() =>
                  send.mutate(
                    { profileId, senderUserId, body: text },
                    { onSuccess: (row) => setSent(row) },
                  )
                }
                className="h-[57px] w-[158px]"
              >
                {send.isPending ? '보내는 중…' : '보내기'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
