import type { CSSProperties } from 'react';
import { asset } from '../../assets/ui';
import { cn } from '../../lib/utils';

// 신규 디자인은 어르신 사진을 원형으로 노출한다(실측 r63).
//   xl 99 (담당 어르신 리스트) · lg 76 (최근 대화) · md 50 · sm 40 (탑바)
// 사진이 없으면 Figma 기본 아바타 에셋을 그대로 쓴다(코드로 그리지 않는다).
const SIZE = { sm: 40, md: 50, lg: 76, xl: 99 } as const;

interface Props {
  /** 실측 감사 앵커(data-fx) 등 통과 속성. */
  'data-fx'?: string;
  /** 절대 배치용(기관 관리 구성원 목록 등). */
  style?: CSSProperties;
  /** Storage signed URL. 없으면 기본 아바타. */
  src?: string | null;
  name?: string;
  size?: keyof typeof SIZE;
  /** 실측이 표준 단계와 다를 때(예: 어르신 카드 101). */
  px?: number;
  /** 보호자 연결 후 화면(50:378)은 원형이 아니라 r10 사각형이다. */
  shape?: 'circle' | 'rounded';
  className?: string;
}

export function Avatar({ src, name, size = 'md', px: pxProp, shape = 'circle', className, style, ...rest }: Props) {
  const px = pxProp ?? SIZE[size];
  return (
    <img
      {...rest}
      src={src || asset.avatarDefault}
      alt={name ? `${name} 어르신 사진` : ''}
      width={px}
      height={px}
      className={cn('shrink-0 object-cover', shape === 'circle' ? 'rounded-full' : 'rounded-[10px]', className)}
      style={{ width: px, height: px, ...style }}
    />
  );
}
