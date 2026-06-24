import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="px-8 py-6 border-b border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description ? (
            <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
