// 요양보호사 PIN 모달 — 설정(setup)과 확인(verify) 두 가지.
//
// 시안이 없는 화면이다(계획 §7 결정 2026-09-24: 기존 디자인과 최대한 같게 최소 구현, 시안이 오면 교체).
// 새 시각 요소를 만들지 않고 기존 토큰만 쓴다: 주황 #e9822b · 테두리 #cccdce · r10 ·
// 보조 텍스트 #7b7c7c · 경고 text-danger · Pretendard 굵기 클래스.
// 숫자 버튼은 고령자 UI 기준(큰 터치 영역)과 요양보호사가 한 손으로 누르기 쉬운 크기로 둔다.
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  PinAttempts,
  PIN_LENGTH,
  PIN_MAX_FAILURES,
  setCaregiverPin,
  verifyCaregiverPin,
} from './caregiverPin';

type Mode = 'setup' | 'verify';

/** 앱 프로세스 단위 실패 잠금 — 모달을 닫았다 열어도 초기화되지 않는다. */
const attempts = new PinAttempts();

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function CaregiverPinModal({
  visible,
  mode,
  userId,
  onDone,
  onCancel,
}: {
  visible: boolean;
  mode: Mode;
  userId: string;
  /** setup: 저장 완료 · verify: PIN 일치. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const [digits, setDigits] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  const reset = () => {
    setDigits('');
    setFirst(null);
    setMessage(null);
  };

  const title = mode === 'verify' ? '선생님 확인' : first === null ? 'PIN 정하기' : 'PIN 한 번 더';
  const guide =
    mode === 'verify'
      ? '요양보호사 PIN 4자리를 눌러 주세요.'
      : first === null
        ? '어르신 화면에서 돌아올 때 쓸 숫자 4자리를 정해 주세요.'
        : '같은 숫자 4자리를 한 번 더 눌러 주세요.';

  async function complete(pin: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (mode === 'setup') {
        if (first === null) {
          setFirst(pin);
          setDigits('');
          setMessage(null);
          return;
        }
        if (first !== pin) {
          reset();
          setMessage('두 번 누른 숫자가 달라요. 처음부터 다시 정해 주세요.');
          return;
        }
        try {
          await setCaregiverPin(userId, pin);
        } catch {
          reset();
          setMessage('PIN을 저장하지 못했어요. 다시 시도해 주세요.');
          return;
        }
        reset();
        onDone();
        return;
      }
      const now = Date.now();
      const locked = attempts.remainingLock(now);
      if (locked > 0) {
        setDigits('');
        setMessage(`잠시 후 다시 눌러 주세요. (${Math.ceil(locked / 1000)}초)`);
        return;
      }
      const ok = await verifyCaregiverPin(userId, pin);
      const result = attempts.record(ok, Date.now());
      setDigits('');
      if (ok) {
        setMessage(null);
        onDone();
        return;
      }
      setMessage(
        result.lockedMs > 0
          ? `여러 번 틀려서 ${Math.round(result.lockedMs / 1000)}초 동안 잠겼어요.`
          : `PIN이 맞지 않아요. (${result.failures}/${PIN_MAX_FAILURES})`,
      );
    } finally {
      busy.current = false;
    }
  }

  function press(key: string) {
    if (busy.current || digits.length >= PIN_LENGTH) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === PIN_LENGTH) void complete(next);
  }

  const cancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={cancel} supportedOrientations={['portrait']}>
      <SafeAreaView className="flex-1 bg-white items-center justify-center" edges={['top', 'bottom']}>
        <Text className="text-[26px] font-semibold text-black text-center" style={{ lineHeight: 40 }}>
          {title}
        </Text>
        <Text className="text-[18px] font-medium text-center" style={{ lineHeight: 28, marginTop: 8, color: '#7b7c7c', width: 300 }}>
          {guide}
        </Text>

        <View className="flex-row" style={{ marginTop: 28 }} accessibilityLabel={`${digits.length}자리 입력됨`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                marginHorizontal: 10,
                borderWidth: 2,
                borderColor: i < digits.length ? '#e9822b' : '#cccdce',
                backgroundColor: i < digits.length ? '#e9822b' : '#ffffff',
              }}
            />
          ))}
        </View>

        <Text
          className="text-[16px] font-medium text-danger text-center"
          accessibilityLiveRegion="polite"
          style={{ lineHeight: 24, marginTop: 16, minHeight: 24, width: 300 }}
        >
          {message ?? ''}
        </Text>

        <View style={{ width: 300, marginTop: 16 }}>
          {[0, 1, 2].map((row) => (
            <View key={row} className="flex-row justify-between" style={{ marginBottom: 12 }}>
              {KEYS.slice(row * 3, row * 3 + 3).map((k) => (
                <PinKey key={k} label={k} onPress={() => press(k)} />
              ))}
            </View>
          ))}
          <View className="flex-row justify-between">
            <PinKey label="취소" small onPress={cancel} />
            <PinKey label="0" onPress={() => press('0')} />
            <PinKey label="지우기" small onPress={() => setDigits((d) => d.slice(0, -1))} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function PinKey({ label, onPress, small }: { label: string; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center justify-center active:opacity-60"
      style={{ width: 88, height: 68, borderRadius: 10, borderWidth: 1, borderColor: '#cccdce', backgroundColor: '#ffffff' }}
    >
      <Text
        className={small ? 'text-[18px] font-semibold' : 'text-[28px] font-semibold text-black'}
        style={small ? { color: '#7b7c7c', lineHeight: 28 } : { lineHeight: 36 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
