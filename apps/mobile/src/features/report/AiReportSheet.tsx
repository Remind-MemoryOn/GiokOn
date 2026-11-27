// AI 응답 신고 시트 — Google Play AI 생성 콘텐츠 정책: 앱을 떠나지 않고 개발자에게 신고할 수 있어야 한다(2026-11-27).
//
// 시안이 없는 부품이다 — 선택 목록 시트(form.tsx SelectField)와 같은 하단 시트 체계로 최소 구현한다.
// 신고는 운영자에게 가는 본인 명의 비공개 문의다(`@giokon/data` reportAiResponse — 사유·AI 발화·세션 id).
// 요양보호사 화면에서만 연다(어르신 화면에는 두지 않는다 — 어르신 화면은 대화만 보이는 단순 화면이다).
// 처리 절차: `docs/runbooks/account-deletion-and-ai-reports.md` §3.
import { useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { AI_REPORT_REASONS, SUPPORT_NOTE_MAX, type AiReportReason } from '@giokon/core';
import { reportAiResponse } from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import { KeyboardSurface, MODAL_ORIENTATIONS } from '../../components/KeyboardForm';
import { C } from '../../theme';

export interface AiReportTarget {
  aiText: string;
  sessionId: string | null;
  turnId?: string | null;
  spokenAt?: string | null;
}

export function AiReportSheet({ target, onClose }: { target: AiReportTarget | null; onClose: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState<AiReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const close = () => {
    if (sending) return;
    setReason(null);
    setNote('');
    onClose();
  };

  const send = async () => {
    if (!target || !reason || !user?.id || sending) return;
    setSending(true);
    try {
      await reportAiResponse(user.id, {
        reason,
        aiText: target.aiText,
        sessionId: target.sessionId,
        turnId: target.turnId ?? null,
        spokenAt: target.spokenAt ?? null,
        source: 'app',
        appVersion: Constants.expoConfig?.version ?? null,
        note,
      });
      setSending(false);
      close();
      Alert.alert('신고를 보냈어요', '기억온 운영자가 확인하고 AI 응답 기준을 보완하는 데 쓸게요.');
    } catch (e) {
      setSending(false);
      Alert.alert('신고 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    }
  };

  return (
    <Modal visible={target !== null} supportedOrientations={MODAL_ORIENTATIONS} transparent animationType="fade" onRequestClose={close}>
      <KeyboardSurface>
        <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={close} accessibilityLabel="신고 닫기">
          {/* 시트 안을 눌러도 닫히지 않게 한다 */}
          <Pressable
            className="bg-white"
            onPress={() => {}}
            style={{ borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 18, paddingBottom: 24, paddingHorizontal: 29 }}
          >
            <Text className="text-[18px] font-semibold text-black text-center" style={{ lineHeight: 30 }}>
              AI 응답 신고
            </Text>
            <Text className="text-[13px] font-normal text-muted" style={{ lineHeight: 20, marginTop: 4 }} numberOfLines={3}>
              “{target?.aiText ?? ''}”
            </Text>

            <View style={{ marginTop: 12 }} accessibilityRole="radiogroup">
              {AI_REPORT_REASONS.map((r) => {
                const on = reason === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setReason(r.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center active:opacity-70"
                    style={{ height: 44 }}
                  >
                    <View
                      style={{
                        width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                        borderColor: on ? C.accent : '#cccdce', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} /> : null}
                    </View>
                    <Text className={`text-[15px] font-normal ${on ? 'text-accent' : 'text-black'}`} style={{ marginLeft: 12, lineHeight: 22 }}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="자세한 내용(선택)"
              accessibilityLabel="신고 내용"
              placeholderTextColor="#7b7c7c"
              maxLength={SUPPORT_NOTE_MAX}
              multiline
              className="text-[14px] text-ink font-normal"
              style={{ marginTop: 8, minHeight: 64, borderRadius: 5, backgroundColor: '#f4f4f4', paddingHorizontal: 14, paddingVertical: 10, textAlignVertical: 'top' }}
            />

            <View className="flex-row" style={{ marginTop: 16, columnGap: 10 }}>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                className="flex-1 items-center justify-center active:opacity-70"
                style={{ height: 46, borderRadius: 5, borderWidth: 1, borderColor: '#cccdce' }}
              >
                <Text className="text-[15px] font-semibold" style={{ color: '#7b7c7c' }}>취소</Text>
              </Pressable>
              <Pressable
                onPress={() => void send()}
                disabled={!reason || sending}
                accessibilityRole="button"
                accessibilityState={{ disabled: !reason || sending, busy: sending }}
                className="flex-1 items-center justify-center active:opacity-90"
                style={{ height: 46, borderRadius: 5, backgroundColor: !reason || sending ? C.accentPressed : C.accent }}
              >
                <Text className="text-[15px] font-semibold text-white">{sending ? '보내는 중…' : '신고 보내기'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardSurface>
    </Modal>
  );
}

/** 작은 '신고' 링크 — 대화 화면 질문 카드 아래·대화 기록 AI 말풍선 옆. */
export function AiReportLink({ onPress, label = 'AI 응답 신고' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="AI 응답 신고" hitSlop={10} className="active:opacity-60">
      <Text className="text-[12px] font-normal text-muted" style={{ lineHeight: 20, textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Pressable>
  );
}
