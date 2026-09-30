// 보호자 화면 머리 — 인사말·부제·연결된 어르신 pill (Figma 50:543 · 96:94 공통 실측).
//   인사말 Bold 30/40 @(322,186) — 이름만 주황 · 부제 20/30 @(322,236.14)
//   pill 322×57 @(1054,187) — 라벨 SemiBold 18(주황 @34 · 검정 @161) · ∨ 15.37×10 @276
import { useSearchParams } from 'react-router-dom';
import { toElderProfile, useProfiles } from '@giokon/data';
import { asset } from '../assets/ui';
import { Y } from '../lib/analysis';
import { useAuth } from '../auth/AuthProvider';
import { ELDER_PARAM, useGuardianElder } from '../lib/guardianElder';
import { Select } from './ui/Select';

export function GuardianGreeting({
  name, subtitle, fxTitle, fxDesc, top = 186, descTop = 236.14,
}: {
  name: string | null | undefined;
  subtitle: string;
  fxTitle: string;
  fxDesc: string;
  top?: number;
  descTop?: number;
}) {
  return (
    <>
      <h1
        data-fx={fxTitle}
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(top) }}
      >
        {/* 이름은 로그인 계정에서 온다 */}
        안녕하세요, <span className="text-accent">{name ?? '보호자'}</span> 보호자님!
      </h1>
      <p
        data-fx={fxDesc}
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(descTop) }}
      >
        {subtitle}
      </p>
    </>
  );
}

export function ElderPill({
  elderName, fxBox, fxLabel, fxName, top = 187,
}: {
  elderName: string | null | undefined;
  to: string;
  fxBox: string;
  fxLabel: string;
  fxName: string;
  top?: number;
}) {
  const { isConfigured } = useAuth();
  const { approved, link, loading } = useGuardianElder();
  const profiles = useProfiles({ enabled: isConfigured });
  const [, setSearch] = useSearchParams();
  const names = new Map((profiles.data ?? []).map((profile) => [profile.id, toElderProfile(profile).name]));
  return (
    <Select
      aria-label="연결된 어르신 선택"
      value={link?.profile_id ?? ''}
      disabled={loading || approved.length === 0}
      onChange={(event) => {
        const id = event.target.value;
        if (!approved.some((item) => item.profile_id === id)) return;
        setSearch((current) => {
          const next = new URLSearchParams(current);
          next.set(ELDER_PARAM, id);
          return next;
        });
      }}
      data-fx={fxBox}
      className="absolute flex h-[57px] w-[322px] items-center rounded-[10px] border border-accent bg-white"
      style={{ left: 1054, top: Y(top) }}
      trigger={<>
      <span
        data-fx={fxLabel}
        className="absolute left-[34px] whitespace-nowrap text-[18px] font-semibold leading-[30px] text-accent"
      >
        연결된 어르신
      </span>
      <span
        data-fx={fxName}
        className="absolute left-[161px] max-w-[106px] truncate whitespace-nowrap text-[18px] font-semibold leading-[30px] text-ink-900"
      >
        {elderName ? `${elderName} 어르신` : '—'}
      </span>
      <img
        src={asset.iconChevronDownSm}
        alt=""
        className="absolute left-[276px] block"
        style={{ width: 15.37, height: 10 }}
      />
      </>}
    >
      {approved.length === 0 ? <option value="">연결된 어르신 없음</option> : null}
      {approved.map((item) => <option key={item.profile_id} value={item.profile_id}>{names.get(item.profile_id) ? `${names.get(item.profile_id)} 어르신` : item.profile_id === link?.profile_id && elderName ? `${elderName} 어르신` : '이름 확인 중'}</option>)}
    </Select>
  );
}
