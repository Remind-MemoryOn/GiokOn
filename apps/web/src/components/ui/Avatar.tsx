import { cn, initial } from '../../lib/utils';

interface Props {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export function Avatar({ name, color = '#fbb78c', size = 'md', className }: Props) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-slate-900 shrink-0',
        SIZE[size],
        className
      )}
      style={{ background: color }}
    >
      {initial(name)}
    </div>
  );
}
