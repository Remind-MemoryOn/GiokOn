// 어르신 등록 (Figma 172:330 — 카드 1054×886, 어르신 관리 위에 뜨는 모달)
//   제목 Bold 25/70 @(87,27) · 사진 업로드 187×193 r14 @(87,106) — 글리프 35 @(161,170) ·
//   2열 폼(좌 입력 88 · 우 입력 551, 라벨은 +1) 입력 416×57 · 주요 기억 880×57 @(88,691) ·
//   취소/저장 140×57 @(656|826, 776)
//
// ⚠️ Figma 가 같은 폼의 x 를 87~90(좌)·550~553(우)로 흘려 놨다 → **입력 88/551 · 라벨
//    89/552**(라벨이 1px 안쪽)로 통일한다. 실측 평균이라 어느 항목도 1px 을 넘지 않는다.
// ⚠️ 등록 폼에는 **특이사항이 없다**(수정 폼에만 있다) — 디자인 그대로 둔다.
// ⚠️ 파일럿 W8(2026-09-27, 사용자 확정): **장기요양등급**을 사진 오른쪽 빈 자리(우열 551, 입력 아래끝 = 사진 아래끝 299)에
//    둔다 — 모달 높이·칸·버튼 좌표는 그대로다. 기관 시설 유형이 주간보호면 필수(별표 + 미입력이면 다음 단계로 못 감).
// ⚠️ 사진은 프로필 행을 만든 **뒤에** 올린다. Storage 정책이 경로의 profile_id 로
//    `profiles` 를 조회하기 때문이다(행이 없으면 업로드가 거부된다).
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { careGradeRequired, toCareGrade, useCreateProfile, useCurrentUser, useDeleteProfile, useOrgSettings, useRecordConsent, useUpdateProfile } from '@giokon/data';
import { CareGradeSelect } from '../../components/CareGradeSelect';
import { CONSENT_CATALOG, CONSENT_SUBJECT_OPTIONS, KEY_MEMORY_TOPIC, birthSlashLabel, isBirthDate, requiredElderConsents, type ConsentSubjectType, type ConsentType } from '@giokon/core';
import { useCreateChronicle } from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { uploadElderPhoto } from '../../lib/elderPhotos';
import { useModalA11y } from '../../lib/modalA11y';
import { CONSENT_DOCUMENT_PATH } from '../../lib/consentDocuments';
import { consentSaveError, elderConsentGrant } from '../../lib/consents';

const COL = { inputL: 88, labelL: 89, inputR: 551, labelR: 552 };
const VALUE = 'text-w-sub leading-[21px] text-ink-900';

/** 라벨(Medium 20) + 필수 별표 — 별표는 Figma 실측 좌표 그대로 받는다. */
function Label({
  fx,
  left,
  top,
  star,
  htmlFor,
  children,
}: {
  fx?: string;
  left: number;
  top: number;
  star?: { left: number; top: number };
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label
        data-fx={fx}
        htmlFor={htmlFor}
        className="absolute whitespace-nowrap text-w-body font-medium leading-[24px] text-ink-900"
        style={{ left, top }}
      >
        {children}
      </label>
      {star ? (
        <span
          className="absolute text-[12px] font-medium leading-[30px] text-accent"
          style={{ left: star.left, top: star.top }}
          aria-hidden
        >
          ✱
        </span>
      ) : null}
    </>
  );
}

function Field({
  fx,
  id,
  left,
  top,
  width = 416,
  value,
  onChange,
  placeholder,
  trailingIcon,
}: {
  fx: string;
  id: string;
  left: number;
  top: number;
  width?: number;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  trailingIcon?: { fx: string; src: string; size: number; right: number };
}) {
  return (
    <>
      <input
        data-fx={fx}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`absolute h-[57px] rounded-[10px] border border-line bg-white focus:border-accent focus:outline-none ${VALUE} placeholder:text-ink-500`}
        style={{
          left,
          top,
          width,
          paddingLeft: 29,
          paddingRight: trailingIcon ? trailingIcon.right + trailingIcon.size + 8 : 29,
        }}
      />
      {trailingIcon ? (
        <img
          data-fx={trailingIcon.fx}
          src={trailingIcon.src}
          alt=""
          width={trailingIcon.size}
          height={trailingIcon.size}
          className="pointer-events-none absolute block"
          style={{
            left: left + width - trailingIcon.right - trailingIcon.size,
            top: top + (57 - trailingIcon.size) / 2,
          }}
        />
      ) : null}
    </>
  );
}

export function ElderRegisterDialog() {
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const { isConfigured } = useAuth();
  const currentUser = useCurrentUser();
  const create = useCreateProfile();
  const deleteProfile = useDeleteProfile();
  const update = useUpdateProfile();
  const createChronicle = useCreateChronicle();
  const recordConsent = useRecordConsent();
  const fileRef = useRef<HTMLInputElement>(null);
  // React 상태가 다시 그려지기 전의 연속 클릭까지 즉시 차단한다.
  const savingRef = useRef(false);

  const [form, setForm] = useState({
    name: '',
    birthDate: '',
    hometown: '',
    family: '',
    job: '',
    hobbies: '',
    memory: '',
    careGrade: '',
  });
  const settings = useOrgSettings({ enabled: isConfigured });
  const gradeRequired = careGradeRequired(settings.data?.facility_type);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'details' | 'consents'>('details');
  const [consentSubject, setConsentSubject] = useState<ConsentSubjectType>('self');
  const [proxyName, setProxyName] = useState('');
  const [proxyRelation, setProxyRelation] = useState('');
  const elderConsentTypes = requiredElderConsents();
  const [consentChecks, setConsentChecks] = useState<Record<ConsentType, boolean>>(
    () => Object.fromEntries(requiredElderConsents().map((type) => [type, false])) as Record<ConsentType, boolean>,
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => {
    if (!savingRef.current) navigate('/caregiver/elders');
  };
  // 시안 치수를 직접 그린 모달이라 공용 Dialog 를 쓰지 않는다 — 키보드 동작만 공유한다.
  const panel = useModalA11y(true, close);

  async function save() {
    if (savingRef.current) return;
    if (!form.name.trim()) return toast('error', '이름을 입력해 주세요.');
    if (!isBirthDate(form.birthDate)) return toast('error', '생년월일을 선택해 주세요.');
    if (gradeRequired && !toCareGrade(form.careGrade)) return toast('error', '주간보호 기관은 장기요양등급을 입력해야 해요.');
    if (step === 'details') {
      setStep('consents');
      return;
    }
    if (!elderConsentTypes.every((type) => consentChecks[type])) return toast('error', '필수 동의 4개를 모두 확인해 주세요.');
    if (consentSubject !== 'self' && (!proxyName.trim() || !proxyRelation.trim())) return toast('error', '대리 동의자 성명과 관계를 입력해 주세요.');
    const userId = currentUser.data?.id;
    if (!userId) return toast('error', '로그인 정보를 확인할 수 없어요.');
    savingRef.current = true;
    setSaving(true);
    let createdProfileId: string | null = null;
    try {
      const row = await create.mutateAsync({
        user_id: userId,
        name: form.name.trim(),
        birth_date: form.birthDate,
        birth_year: Number(form.birthDate.slice(0, 4)),
        hometown: form.hometown.trim() || null,
        family: form.family.trim() || null,
        job: form.job.trim() || null,
        hobbies: form.hobbies.trim() || null,
        care_grade: toCareGrade(form.careGrade),
      });
      createdProfileId = row.id;
      for (const consentType of elderConsentTypes) {
        await recordConsent.mutateAsync(
          elderConsentGrant({
            profileId: row.id,
            userId,
            orgId: currentUser.data?.org_id ?? null,
            type: consentType,
            subject: consentSubject,
            proxyName,
            proxyRelation,
          }),
        );
      }
      // 사진은 행이 생긴 뒤에만 올릴 수 있다. 실패해도 등록 자체는 살린다.
      if (photo && isConfigured) {
        try {
          const path = await uploadElderPhoto(row.id, photo.file);
          await update.mutateAsync({ id: row.id, patch: { photo_path: path } });
        } catch (err) {
          toast('error', `사진만 저장하지 못했어요: ${(err as Error).message}`);
        }
      }
      const memory = form.memory.trim();
      if (memory) {
        await createChronicle.mutateAsync({
          profile_id: row.id,
          user_id: userId,
          topic: KEY_MEMORY_TOPIC,
          content: memory,
          source: 'caregiver',
          keywords: [],
        });
      }
      toast('success', `${row.name} 어르신을 등록했어요.`);
      navigate(`/caregiver/elders/${row.id}`);
    } catch (err) {
      // 프로필 생성 뒤 동의·연대기 저장이 실패하면 반쪽짜리 어르신을 남기지 않는다.
      // 특히 enum 미반영 상태에서 사용자가 다시 눌러 중복 등록되는 문제를 막는다.
      let rollbackFailed = false;
      if (createdProfileId) {
        try {
          await deleteProfile.mutateAsync(createdProfileId);
        } catch {
          rollbackFailed = true;
        }
      }
      const message = err instanceof Error ? err.message : '어르신 등록에 실패했어요.';
      const friendly = consentSaveError(message);
      toast(
        'error',
        rollbackFailed
          ? `${friendly} 생성된 어르신 정보를 자동 정리하지 못했으므로 관리자 확인이 필요해요.`
          : `${friendly} 등록 내용은 저장하지 않았어요.`,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/30 py-[40px]"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={panel}
        data-fx="172:142"
        role="dialog"
        aria-modal="true"
        aria-label="어르신 등록"
        className="relative h-[886px] w-[1054px] shrink-0 rounded-[10px] bg-white shadow-card"
      >
        <h2
          data-fx="172:143"
          className="absolute left-[87px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          어르신 등록
        </h2>

        {step === 'details' ? <>
        {/* 사진 업로드 */}
        <button
          type="button"
          data-fx="172:224"
          onClick={() => fileRef.current?.click()}
          className="absolute left-[88px] top-[106px] h-[193px] w-[187px] overflow-hidden rounded-[14px] border border-line-soft bg-mute-pale"
        >
          {photo ? (
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <>
              <img
                data-fx="172:225"
                src={asset.iconPhotoUpload}
                alt=""
                width={35}
                height={35}
                className="absolute left-[73px] top-[64px] block"
              />
              <span
                data-fx="172:228"
                className="absolute left-[54px] top-[103px] whitespace-nowrap text-[16px] leading-[30px] text-ink-700"
              >
                사진 업로드
              </span>
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label="어르신 사진 선택"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPhoto({ file, url: URL.createObjectURL(file) });
          }}
        />

        {/* 좌열 */}
        {/* 장기요양등급 — 사진 오른쪽 빈 자리(파일럿 W8). 입력 아래끝을 사진 아래끝(106 + 193)에 맞춘다. */}
        <Label left={COL.labelR} top={299 - 57 - 35} star={gradeRequired ? { left: 657, top: 299 - 57 - 35 - 7 } : undefined} htmlFor="r-care-grade">
          장기요양등급
        </Label>
        <CareGradeSelect id="r-care-grade" left={COL.inputR} top={299 - 57} value={form.careGrade} onChange={set('careGrade')} required={gradeRequired} />

        <Label fx="172:127" left={COL.labelL} top={322} star={{ left: 123, top: 313 }} htmlFor="r-name">
          이름
        </Label>
        <Field
          fx="172:128"
          id="r-name"
          left={COL.inputL}
          top={357}
          value={form.name}
          onChange={set('name')}
          placeholder="이름을 입력해주세요"
        />

        <Label fx="172:132" left={COL.labelL} top={437} star={{ left: 159, top: 430 }} htmlFor="r-birth">
          생년월일
        </Label>
        <div
          data-fx="172:133"
          className="absolute h-[57px] w-[416px] rounded-[10px] border border-line bg-white focus-within:border-accent"
          style={{ left: COL.inputL, top: 472 }}
        >
          <span
            data-fx="172:134"
            className={`pointer-events-none absolute left-[29px] top-1/2 -translate-y-1/2 whitespace-nowrap ${form.birthDate ? VALUE : 'text-w-sub leading-[21px] text-ink-500'}`}
          >
            {form.birthDate ? birthSlashLabel(form.birthDate) : '생년월일을 선택해 주세요'}
          </span>
          <img
            data-fx="314:559"
            src={asset.iconCalendarSm}
            alt=""
            width={22}
            height={22}
            className="pointer-events-none absolute right-[28px] top-1/2 -translate-y-1/2 block"
          />
          <input
            id="r-birth"
            type="date"
            aria-label="생년월일"
            value={form.birthDate}
            onChange={(e) => set('birthDate')(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <Label fx="172:137" left={COL.labelL} top={547} htmlFor="r-hometown">
          출신지
        </Label>
        <Field
          fx="172:138"
          id="r-hometown"
          left={COL.inputL}
          top={581}
          value={form.hometown}
          onChange={set('hometown')}
          placeholder="출신 지역 검색하기"
          trailingIcon={{ fx: '172:234', src: asset.iconSearchField, size: 25, right: 27 }}
        />

        {/* 우열 */}
        <Label fx="172:253" left={COL.labelR} top={322} htmlFor="r-family">
          가족 구성
        </Label>
        <Field
          fx="172:254"
          id="r-family"
          left={COL.inputR}
          top={357}
          value={form.family}
          onChange={set('family')}
          placeholder="가족 구성을 입력해 주세요"
        />
        <Label fx="172:257" left={COL.labelR} top={437} htmlFor="r-job">
          직업 이력
        </Label>
        <Field
          fx="172:258"
          id="r-job"
          left={COL.inputR}
          top={472}
          value={form.job}
          onChange={set('job')}
          placeholder="직업 이력을 입력해 주세요"
        />
        <Label fx="172:261" left={COL.labelR} top={547} htmlFor="r-hobbies">
          취미
        </Label>
        <Field
          fx="172:262"
          id="r-hobbies"
          left={COL.inputR}
          top={581}
          value={form.hobbies}
          onChange={set('hobbies')}
          placeholder="취미를 입력해 주세요"
        />

        {/* 주요 기억 — 등록 시 한 건. 나머지는 기본 정보 수정에서 추가한다. */}
        <Label fx="172:269" left={COL.labelL} top={657} htmlFor="r-memory">
          주요 기억
        </Label>
        <Field
          fx="172:270"
          id="r-memory"
          left={COL.inputL}
          top={691}
          width={880}
          value={form.memory}
          onChange={set('memory')}
          placeholder="주요 기억을 입력해 주세요"
        />
        </> : (
          <div className="absolute left-[88px] top-[105px] h-[635px] w-[878px] overflow-y-auto pr-3">
            <p className="text-w-body font-semibold text-ink-900">동의 주체를 선택해 주세요. <span className="text-accent">(필수)</span></p>
            <div className="mt-3 flex gap-3">
              {CONSENT_SUBJECT_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setConsentSubject(option.value)} className={`rounded-[10px] border px-5 py-3 text-w-label ${consentSubject === option.value ? 'border-accent text-accent' : 'border-line text-ink-700'}`}>{option.label}</button>
              ))}
            </div>
            {consentSubject !== 'self' ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <input value={proxyName} onChange={(e) => setProxyName(e.target.value)} placeholder="대리 동의자 성명 (필수)" className="h-[50px] rounded-[10px] border border-line px-4" />
                <input value={proxyRelation} onChange={(e) => setProxyRelation(e.target.value)} placeholder="어르신과의 관계 (필수)" className="h-[50px] rounded-[10px] border border-line px-4" />
              </div>
            ) : null}
            <div className="mt-5 space-y-3">
              {elderConsentTypes.map((type) => {
                return (
                  <div key={type} className="rounded-[10px] border border-line p-4">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={consentChecks[type]} onChange={(e) => setConsentChecks((current) => ({ ...current, [type]: e.target.checked }))} aria-label={CONSENT_CATALOG[type].label} className="mt-1 h-[17px] w-[17px] accent-accent" />
                      <div className="min-w-0 flex-1"><p className="font-semibold text-ink-900">{CONSENT_CATALOG[type].label}</p><p className="mt-1 text-w-label text-ink-500">{CONSENT_CATALOG[type].summary}</p></div>
                      <a href={CONSENT_DOCUMENT_PATH[type]} target="_blank" rel="noreferrer" className="shrink-0 text-w-label text-accent underline">상세보기</a>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-w-label leading-6 text-ink-500">필수 동의에 모두 동의해야 어르신 등록과 AI 회상 대화 기능을 이용할 수 있습니다.</p>
          </div>
        )}

        <button
          type="button"
          data-fx="172:274"
          onClick={step === 'details' ? close : () => setStep('details')}
          className="absolute left-[656px] top-[776px] h-[57px] w-[140px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
        >
          {step === 'details' ? '취소' : '이전'}
        </button>
        <button
          type="button"
          data-fx="172:280"
          onClick={save}
          disabled={saving}
          className="absolute left-[826px] top-[776px] h-[57px] w-[140px] rounded-[10px] border border-accent bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-50"
        >
          {saving ? '저장 중...' : step === 'details' ? '다음' : '동의 후 등록'}
        </button>
      </div>
    </div>
  );
}
