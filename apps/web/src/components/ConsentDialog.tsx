// 어르신 동의 수집 다이얼로그 (M9.1·M9.2)
//
// 대화 세션에 필요한 필수 동의(민감정보·국외이전·AI 고지)를 어르신 단위로 수집한다.
// 동의 주체(본인/보호자/성년후견인)와 의사능력 판정을 함께 기록하고, 성년후견이
// 개시되지 않은 보호자 대리동의는 법적 한계 위험고지를 확인받는다(회색지대 —
// docs/compliance.md §1.2). 동의 문구 최종본은 외부 법무 자문 검토 대상.

import { useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  CONSENT_CATALOG,
  CONSENT_VERSION,
  requiredElderConsents,
  type ConsentType,
} from '@giokon/core';
import {
  useCurrentUser,
  useRecordConsent,
  type ConsentCapacity,
  type ConsentSubjectType,
} from '@giokon/data';
import { Dialog } from './ui/Dialog';
import { Field, Input } from './ui/Input';
import { Button } from './ui/Button';
import { useStore } from '../store/store';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  elderId: string;
  elderName: string;
  /** 이미 확보된 동의 유형(체크 상태 초기화용). */
  granted: ConsentType[];
  onCompleted?: () => void;
}

const SUBJECT_OPTIONS: { value: ConsentSubjectType; label: string; hint: string }[] = [
  { value: 'self', label: '어르신 본인', hint: '어르신이 내용을 이해하고 직접 동의' },
  { value: 'legal_representative', label: '성년후견인', hint: '법원이 선임한 후견인(법정대리)' },
  { value: 'guardian', label: '가족 보호자', hint: '후견 미개시 — 법적 한계 고지 필요' },
];

const CAPACITY_OPTIONS: { value: ConsentCapacity; label: string }[] = [
  { value: 'capable', label: '본인 동의 가능' },
  { value: 'limited', label: '부분적으로 가능' },
  { value: 'incapable', label: '어려움' },
  { value: 'unknown', label: '판단 어려움' },
];

export function ConsentDialog({ open, onClose, elderId, elderName, granted, onCompleted }: Props) {
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const recordConsent = useRecordConsent();

  const required = requiredElderConsents();
  const [checked, setChecked] = useState<Set<ConsentType>>(new Set());
  const [subjectType, setSubjectType] = useState<ConsentSubjectType>('self');
  const [capacity, setCapacity] = useState<ConsentCapacity>('capable');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('');
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  const missing = required.filter((t) => !granted.includes(t));
  const isProxy = subjectType !== 'self';
  const needsRiskNotice = subjectType === 'guardian';

  function toggle(type: ConsentType) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function submit() {
    const userId = currentUser.data?.id;
    if (!userId) {
      toast('error', '로그인 정보를 확인할 수 없습니다. Supabase 연동 후 이용해 주세요.');
      return;
    }
    const toRecord = missing.filter((t) => checked.has(t));
    if (toRecord.length !== missing.length) {
      toast('error', '필수 동의 항목을 모두 확인해 주세요.');
      return;
    }
    if (isProxy && !guardianName.trim()) {
      toast('error', '대리 동의자 성함을 입력해 주세요.');
      return;
    }
    if (needsRiskNotice && !riskAcknowledged) {
      toast('error', '법적 한계 안내를 확인해 주세요.');
      return;
    }

    setSaving(true);
    try {
      for (const type of toRecord) {
        await recordConsent.mutateAsync({
          user_id: userId,
          profile_id: elderId,
          consent_type: type,
          granted: true,
          version: CONSENT_VERSION,
          subject_type: subjectType,
          capacity,
          guardian_name: isProxy ? guardianName.trim() : null,
          guardian_relation: isProxy ? guardianRelation.trim() || null : null,
          basis: needsRiskNotice
            ? '성년후견 미개시 보호자 확인 — 법적 한계 위험고지 후 최소수집 원칙으로 진행'
            : null,
        });
      }
      toast('success', '동의를 기록했습니다.');
      onCompleted?.();
      onClose();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '동의 기록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${elderName} 어르신 동의 받기`}
      description="대화 세션 시작 전, 아래 필수 동의가 필요합니다. 동의·철회 이력은 안전하게 보관됩니다."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving}>
            <ShieldCheck size={15} /> {saving ? '기록 중...' : '동의 기록'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 필수 동의 항목 */}
        <div className="space-y-2">
          {missing.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              필수 동의가 모두 확보되어 있습니다.
            </div>
          ) : (
            missing.map((type) => {
              const def = CONSENT_CATALOG[type];
              return (
                <label
                  key={type}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition',
                    checked.has(type)
                      ? 'border-warm-400 bg-warm-50/60'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(type)}
                    onChange={() => toggle(type)}
                    className="mt-1 w-4 h-4 accent-warm-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{def.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{def.summary}</div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* 동의 주체 */}
        <Field label="동의 주체" required>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SUBJECT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSubjectType(opt.value)}
                className={cn(
                  'text-left rounded-xl border-2 p-3 transition',
                  subjectType === opt.value
                    ? 'border-warm-400 bg-warm-50/60'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{opt.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        {/* 의사능력 판정 */}
        <Field
          label="어르신 의사능력(참고 기록)"
          hint="의학적 판정이 아니라 동의 절차 기록용입니다."
        >
          <div className="flex flex-wrap gap-2">
            {CAPACITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCapacity(opt.value)}
                className={cn(
                  'rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition',
                  capacity === opt.value
                    ? 'border-warm-400 bg-warm-50 text-warm-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 대리 동의자 정보 */}
        {isProxy ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="대리 동의자 성함" required>
              <Input
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="예: 박민준"
              />
            </Field>
            <Field label="어르신과의 관계">
              <Input
                value={guardianRelation}
                onChange={(e) => setGuardianRelation(e.target.value)}
                placeholder="예: 아들 / 성년후견인"
              />
            </Field>
          </div>
        ) : null}

        {/* 후견 미개시 보호자 — 법적 한계 위험고지 */}
        {needsRiskNotice ? (
          <label className="flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={riskAcknowledged}
              onChange={(e) => setRiskAcknowledged(e.target.checked)}
              className="mt-1 w-4 h-4 accent-amber-500"
            />
            <div className="text-xs text-amber-900 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} /> 법적 한계 안내
              </div>
              성년후견이 개시되지 않은 가족 보호자의 동의는 법적 대리 효력에 한계가 있을 수
              있음을 이해했습니다. 가능한 범위에서 어르신 본인의 의사를 함께 확인하고,
              최소한의 정보만 수집하는 데 동의합니다.
            </div>
          </label>
        ) : null}

        <p className="text-[11px] text-slate-400 leading-relaxed">
          동의 문구 {CONSENT_VERSION} · 자세한 내용은 개인정보 처리방침을 확인하세요. 동의는
          언제든 철회할 수 있으며, 철회 이력도 함께 보관됩니다.
        </p>
      </div>
    </Dialog>
  );
}
