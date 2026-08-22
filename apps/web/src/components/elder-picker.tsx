// 어르신 고르기 카드 3열 — 세션 기록(178:787)·요양일지(205:1039)·공개 관리(135:1288)가
// **같은 카드**를 쓴다(세 시안의 좌표가 완전히 같다). 셋째 줄 내용만 화면마다 다르다.
//   카드 329×146 r10 shadow-card · 가로 gap 33
//   사진 101 @(+18,+22) · 이름 SemiBold 19/30 @(+134,+30.42) ·
//   나이 l 성별 Medium 16 @(+134,+60.44) · 셋째 줄 Medium 16 @(+134,+86.47)
//
// ⚠️ Figma 는 프레임마다 2·3번째 카드의 사진 x 를 710/1080 으로 흘려 놨다(1번째는 +18)
//    → +18 로 통일한다.
import { Link } from 'react-router-dom';
import { elderAge, type ElderProfile } from '@giokon/core';
import { Avatar } from './ui/Avatar';

const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성' };

/** 화면별 실측 감사 앵커(카드 3장). */
export interface ElderCardFx {
  card?: string;
  photo?: string;
  name?: string;
  meta?: string;
  third?: string;
}

interface Props {
  elders: ElderProfile[];
  /** 경로 → signed URL. */
  photos?: Record<string, string>;
  to: (e: ElderProfile) => string;
  /** 셋째 줄. 근거가 없으면 화면이 직접 빈 표기를 정한다. */
  third: (e: ElderProfile) => string;
  fx?: ElderCardFx[];
  /** 목록이 비었을 때 문구. */
  empty: string;
}

export function ElderPickerGrid({ elders, photos, to, third, fx = [], empty }: Props) {
  if (elders.length === 0) {
    return (
      <p className="w-full rounded-[10px] border border-line bg-white px-[52px] py-16 text-center text-w-body text-ink-500">
        {empty}
      </p>
    );
  }
  return (
    <>
      {elders.map((e, i) => (
        <Link
          key={e.id}
          data-fx={fx[i]?.card}
          to={to(e)}
          className="relative h-[146px] w-[329px] rounded-[10px] bg-white shadow-card transition hover:brightness-[0.98]"
        >
          <Avatar
            src={e.photoPath ? photos?.[e.photoPath] : undefined}
            name={e.name}
            size="xl"
            px={101}
            data-fx={fx[i]?.photo}
            className="absolute left-[18px] top-[22px]"
          />
          <div
            data-fx={fx[i]?.name}
            className="absolute left-[134px] top-[30.42px] whitespace-nowrap text-[19px] font-semibold leading-[30px] text-ink-900"
          >
            {e.name} 어르신
          </div>
          <div
            data-fx={fx[i]?.meta}
            className="absolute left-[134px] top-[60.44px] whitespace-pre text-w-label font-medium leading-[30px] text-ink-400"
          >
            {elderAge(e)}세
            {e.gender ? `   l   ${GENDER_LABEL[e.gender] ?? e.gender}` : ''}
          </div>
          <div
            data-fx={fx[i]?.third}
            className="absolute left-[134px] top-[86.47px] whitespace-pre text-w-label font-medium leading-[30px] text-ink-400"
          >
            {third(e)}
          </div>
        </Link>
      ))}
    </>
  );
}
