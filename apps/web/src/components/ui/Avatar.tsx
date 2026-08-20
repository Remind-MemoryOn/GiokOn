import { asset } from '../../assets/ui';
import { cn } from '../../lib/utils';

// 신규 디자인은 어르신 사진을 원형으로 노출한다(실측 r63).
//   xl 99 (담당 어르신 리스트) · lg 76 (최근 대화) · md 50 · sm 40 (탑바)
// 사진이 없으면 Figma 기본 아바타 에셋을 그대로 쓴다(코드로 그리지 않는다).
const SIZE = { sm: 40, md: 50, lg: 76, xl: 99 } as const;

interface Props {
  /** Storage signed URL. 없으면 기본 아바타. */
  src?: string | null;
  name?: string;
  size?: keyof typeof SIZE;
  className?: string;
}

export function Avatar({ src, name, size = 'md', className }: Props) {
  const px = SIZE[size];
  return (
    <img
      src={src || asset.avatarDefault}
      alt={name ? `${name} 어르신 사진` : ''}
      width={px}
      height={px}
      className={cn('shrink-0 rounded-full object-cover', className)}
      style={{ width: px, height: px }}
    />
  );
}
