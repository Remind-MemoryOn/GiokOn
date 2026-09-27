// 장기요양등급 드롭다운(파일럿 W8) — 등록 모달·기본 정보 수정의 입력 칸과 같은 틀(h57 · r10 · 1px line · 글자 18)
// + 시안의 큰 꺾쇠(221:680). 좌표 화면이라 left/top(px)을 받는다. 빈 값 = 미입력.
import { CARE_GRADE_LABEL, CARE_GRADES } from '@giokon/data';
import { asset } from '../assets/ui';

export function CareGradeSelect({ id, value, onChange, left, top, width = 416, required }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  left: number;
  top: number;
  width?: number;
  required?: boolean;
}) {
  return (
    <div className="absolute" style={{ left, top, width, height: 57 }}>
      <select
        id={id}
        value={value}
        required={required}
        aria-required={required || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full cursor-pointer appearance-none rounded-[10px] border border-line bg-white pl-[29px] pr-[56px] text-w-sub text-ink-900 focus:border-accent focus:outline-none"
      >
        <option value="">{required ? '등급을 골라 주세요(주간보호 필수)' : '선택 안 함'}</option>
        {CARE_GRADES.map((g) => (
          <option key={g} value={g}>
            {CARE_GRADE_LABEL[g]}
          </option>
        ))}
      </select>
      <img
        src={asset.iconChevronDownLg}
        alt=""
        className="pointer-events-none absolute right-[27px] top-1/2 block -translate-y-1/2"
        style={{ width: 19.29, height: 13.02 }}
      />
    </div>
  );
}
