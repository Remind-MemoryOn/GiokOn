// 어르신 기본 정보 수정 (Figma 178:486 — 1440×1528 실측)
//   제목 @169 · 돌아가기 @(1285,197) · 카드 1057×1148 @(322,295) shadow-card
//   사진 187×193 r14 @(409,401) + 카메라 53 @(554,551)
//   2열 폼(좌 410 · 우 873) 입력 416×57 · 주요 기억 881×57 목록 · 특이사항 · 취소/저장 140×57
//
// ⚠️ Figma 가 같은 폼의 x 를 409/410/411/412(좌)·872/873/874/875(우)로 흘려 놨다 →
//    좌 410 · 우 873 으로 통일한다.
// ⚠️ **특이사항**은 `profiles.note`(최대 500자)다 — 돌봄에서 참고할 메모(선호·주의할 점)이고
//    **건강 상태를 적는 칸이 아니다**(비의료 포지셔닝).
// ⚠️ **주요 기억**은 앱과 같은 방식으로 `chronicle_entries(topic='주요 기억')` 에 담는다.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  toElderProfile,
  useChronicles,
  useCreateChronicle,
  useDeleteChronicle,
  useCurrentUser,
  useProfile,
  useUpdateProfile,
} from '@giokon/data';
import { KEY_MEMORY_TOPIC, birthSlashLabel, isBirthDate, type ElderProfile } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

const Y = (v: number) => v - 122;

/** 라벨(Medium 20) + 필수 별표(Medium 12 accent, 라벨보다 9px 위 라인박스). */
function Label({
  fx,
  left,
  top,
  starLeft,
  htmlFor,
  children,
}: {
  fx?: string;
  left: number;
  top: number;
  starLeft?: number;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label
        data-fx={fx}
        htmlFor={htmlFor}
        className="absolute whitespace-nowrap text-w-body font-medium leading-[24px] text-ink-900"
        style={{ left, top: Y(top) }}
      >
        {children}
      </label>
      {starLeft != null ? (
        <span
          className="absolute text-[12px] font-medium leading-[30px] text-accent"
          style={{ left: starLeft, top: Y(top - 9.4) }}
          aria-hidden
        >
          ✱
        </span>
      ) : null}
    </>
  );
}

/** 입력 상자 — 416×57 r10 · 값 Regular 18 @ 좌 +29. */
function Field({
  fx,
  id,
  left,
  top,
  width = 416,
  value,
  onChange,
  placeholder,
  disabled,
  title,
  maxLength,
  trailingIcon,
}: {
  fx?: string;
  id: string;
  left: number;
  top: number;
  width?: number;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  /** DB 제약과 같은 상한을 입력에도 건다(넘겨서 저장 실패하지 않게). */
  maxLength?: number;
  /** 오른쪽 끝 장식 아이콘(예: 출신지 지역 검색 돋보기 194:149) — 크기·오른쪽 여백 실측. */
  trailingIcon?: { fx?: string; src: string; size: number; right: number };
}) {
  return (
    <>
      <input
        data-fx={fx}
        id={id}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        maxLength={maxLength}
        className="absolute h-[57px] rounded-[10px] border border-line bg-white text-w-sub text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none disabled:bg-mute-pale disabled:text-ink-500"
        style={{
          left,
          top: Y(top),
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
            top: Y(top) + (57 - trailingIcon.size) / 2,
          }}
        />
      ) : null}
    </>
  );
}

/** 조회가 끝난 뒤에만 마운트한다(`key={elder.id}`) — 초기값을 props 에서 바로 잡는다. */
function EditForm({ elder, photo }: { elder: ElderProfile; photo?: string }) {
  const elderId = elder.id;
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const chronicles = useChronicles(elderId);
  const currentUser = useCurrentUser();
  const update = useUpdateProfile();
  const createChronicle = useCreateChronicle();
  const deleteChronicle = useDeleteChronicle();

  const [form, setForm] = useState({
    name: elder.name,
    birthDate: elder.birthDate ?? '',
    hometown: elder.hometown ?? '',
    family: elder.family ?? '',
    job: elder.job ?? '',
    hobbies: elder.hobbies ?? '',
    note: elder.note ?? '',
  });
  const [memory, setMemory] = useState('');

  const memories = (chronicles.data ?? []).filter((c) => c.topic === KEY_MEMORY_TOPIC);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    if (!elderId) return;
    if (!form.name.trim()) return toast('error', '이름을 입력해주세요.');
    if (!form.birthDate || !isBirthDate(form.birthDate))
      return toast('error', '생년월일을 선택해주세요.');
    update.mutate(
      {
        id: elderId,
        patch: {
          name: form.name.trim(),
          birth_date: form.birthDate,
          birth_year: Number(form.birthDate.slice(0, 4)),
          hometown: form.hometown.trim() || null,
          family: form.family.trim() || null,
          job: form.job.trim() || null,
          hobbies: form.hobbies.trim() || null,
          note: form.note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast('success', '기본 정보를 저장했어요.');
          navigate(`/caregiver/elders/${elderId}`);
        },
        onError: (err) => toast('error', err.message),
      },
    );
  }

  function addMemory() {
    const content = memory.trim();
    const userId = currentUser.data?.id;
    if (!elderId || !content || !userId) return;
    createChronicle.mutate(
      { profile_id: elderId, user_id: userId, topic: KEY_MEMORY_TOPIC, content, source: 'caregiver', keywords: [] },
      {
        onSuccess: () => setMemory(''),
        onError: (err) => toast('error', err.message),
      },
    );
  }

  return (
    // 좌표가 화면 절대값이라 본문 여백(pl-27)과 사이드바(296)를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[1406px] w-[1440px]">
      <h1
        data-fx="178:487"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        기본 정보 수정
      </h1>
      <p
        data-fx="178:488"
        className="absolute left-[322px] w-[263px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.16) }}
      >
        어르신의 기본 정보를 수정합니다.
      </p>
      <Link
        to={`/caregiver/elders/${elder.id}`}
        data-fx="178:595"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(197.13) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        돌아가기
      </Link>

      {/* 카드 — 이 화면만 테두리 없이 그림자만 쓴다(Figma 194:129) */}
      <div
        data-fx="194:129"
        className="absolute left-[322px] h-[1148px] w-[1057px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(295) }}
      />
      <h2
        data-fx="194:130"
        className="absolute left-[409px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        style={{ top: Y(322) }}
      >
        어르신 기본 정보 수정
      </h2>

      {/* 사진 — 업로드는 Storage 배선(Phase 2)까지 보기 전용 */}
      <div
        data-fx="194:131"
        className="absolute left-[409px] h-[193px] w-[187px] overflow-hidden rounded-[14px] border border-line-soft bg-mute-pale"
        style={{ top: Y(401) }}
      >
        {photo ? (
          <>
            <img src={photo} alt={`${elder.name} 어르신 사진`} className="h-full w-full object-cover" />
            {/* Figma 는 카메라 버튼 가독성을 위해 사진 위에 어두운 막을 덮는다(실측 35%). */}
            <span className="absolute inset-0 bg-[#656565]/35" />
          </>
        ) : null}
      </div>
      <img
        data-fx="194:167"
        src={asset.iconCamera}
        alt=""
        width={53}
        height={53}
        className="absolute left-[554px] block"
        style={{ top: Y(551) }}
      />

      {/* 좌열 */}
      <Label fx="194:132" left={410} top={617.4} starLeft={445} htmlFor="f-name">
        이름
      </Label>
      <Field fx="194:133" id="f-name" left={410} top={652.43} value={form.name} onChange={set('name')} />

      <Label fx="194:136" left={410} top={732.48} starLeft={481} htmlFor="f-birth">
        생년월일
      </Label>
      {/* 값은 Figma 표기(`1938 / 5 / 12`)로 보여 주고, 실제 선택은 네이티브 날짜 입력이 받는다 */}
      <div
        data-fx="194:137"
        className="absolute left-[410px] h-[57px] w-[416px] rounded-[10px] border border-line bg-white focus-within:border-accent"
        style={{ top: Y(767.5) }}
      >
        <span
          className="pointer-events-none absolute left-[29px] top-1/2 -translate-y-1/2 text-w-sub leading-[21px] text-ink-900"
          data-fx="194:138"
        >
          {form.birthDate ? birthSlashLabel(form.birthDate) : ''}
        </span>
        <img
          src={asset.iconCalendar}
          alt=""
          width={22}
          height={22}
          className="pointer-events-none absolute right-[28px] top-1/2 -translate-y-1/2 block"
        />
        <input
          id="f-birth"
          type="date"
          aria-label="생년월일"
          value={form.birthDate}
          onChange={(e) => set('birthDate')(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <Label fx="194:140" left={410} top={842.55} htmlFor="f-hometown">
        출신지
      </Label>
      <Field
        fx="194:141"
        id="f-hometown"
        left={410}
        top={876.57}
        value={form.hometown}
        onChange={set('hometown')}
        placeholder="출신지를 입력해주세요"
        trailingIcon={{ fx: '194:149', src: asset.iconSearchField, size: 25, right: 27 }}
      />

      {/* 우열 */}
      <Label fx="194:150" left={873} top={617.4} htmlFor="f-family">
        가족 구성
      </Label>
      <Field fx="194:151" id="f-family" left={873} top={652.43} value={form.family} onChange={set('family')} placeholder="가족 구성을 입력해주세요" />
      <Label fx="194:153" left={873} top={732.48} htmlFor="f-job">
        직업 이력
      </Label>
      <Field fx="194:154" id="f-job" left={873} top={767.5} value={form.job} onChange={set('job')} placeholder="직업 이력을 입력해주세요" />
      <Label fx="194:156" left={873} top={842.55} htmlFor="f-hobbies">
        취미
      </Label>
      <Field fx="194:157" id="f-hobbies" left={873} top={876.57} value={form.hobbies} onChange={set('hobbies')} placeholder="취미를 입력해주세요" />

      {/* 주요 기억 — chronicle_entries(topic='주요 기억') */}
      <Label fx="194:143" left={410} top={952.62} htmlFor="f-memory">
        주요 기억
      </Label>
      <div
        data-fx="194:144"
        className="absolute left-[410px] h-[57px] w-[881px] rounded-[10px] border border-line bg-white focus-within:border-accent"
        style={{ top: Y(986.65) }}
      >
        <img
          src={asset.iconPlus}
          alt=""
          width={23}
          height={23}
          className="pointer-events-none absolute left-[28px] top-1/2 -translate-y-1/2 block"
        />
        <input
          id="f-memory"
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMemory()}
          onBlur={addMemory}
          placeholder="기억 추가"
          aria-label="주요 기억 추가"
          className="h-full w-full rounded-[10px] bg-transparent pl-[55px] pr-[29px] text-w-sub text-ink-900 placeholder:text-ink-500 focus:outline-none"
        />
      </div>
      {memories.map((m, i) => (
        <div
          key={m.id}
          data-fx={i === 0 ? '194:173' : undefined}
          className="absolute left-[410px] flex h-[57px] w-[881px] items-center rounded-[10px] border border-line bg-white"
          style={{ top: Y(1059.69 + i * 74.05) }}
        >
          <span className="ml-[28px] flex-1 truncate text-w-sub text-ink-900">{m.content}</span>
          <button
            type="button"
            onClick={() =>
              deleteChronicle.mutate(
                { id: m.id, profileId: m.profile_id },
                { onError: (err) => toast('error', err.message) },
              )
            }
            aria-label={`${m.content} 삭제`}
            className="mr-[28px] block"
          >
            <img src={asset.iconClose} alt="" width={18} height={18} className="block" />
          </button>
        </div>
      ))}

      {/* 특이사항 — profiles.note(돌봄 참고 메모, 의료 정보 아님) */}
      <Label fx="194:185" left={410} top={1216.8} htmlFor="f-note">
        특이사항
      </Label>
      <Field
        fx="194:186"
        id="f-note"
        left={410}
        top={1250.82}
        value={form.note}
        onChange={set('note')}
        maxLength={500}
        placeholder="돌봄에서 참고할 점을 적어주세요(선호·주의할 점 등)."
      />

      <Link
        to={`/caregiver/elders/${elder.id}`}
        data-fx="194:160"
        className="absolute flex h-[57px] w-[140px] items-center justify-center rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
        style={{ left: 981, top: Y(1334) }}
      >
        취소
      </Link>
      <button
        type="button"
        onClick={save}
        disabled={update.isPending}
        data-fx="194:163"
        className="absolute flex h-[57px] w-[140px] items-center justify-center rounded-[10px] border border-accent bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-50"
        style={{ left: 1151, top: Y(1334) }}
      >
        {update.isPending ? '저장 중...' : '저장'}
      </button>
    </div>
  );
}

export function ElderEditPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const { isConfigured } = useAuth();
  const profileQuery = useProfile(elderId);
  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  const photos = useElderPhotoUrls(elder?.photoPath ? [elder.photoPath] : [], isConfigured);

  if (profileQuery.isLoading) return null;
  if (!elder) {
    return (
      <p className="mt-[47px] text-w-body text-ink-500">
        {isConfigured ? '어르신을 찾을 수 없어요.' : 'Supabase 연동 후 어르신 정보가 표시됩니다.'}
      </p>
    );
  }
  return (
    <EditForm
      key={elder.id}
      elder={elder}
      photo={elder.photoPath ? photos.data?.[elder.photoPath] : undefined}
    />
  );
}
