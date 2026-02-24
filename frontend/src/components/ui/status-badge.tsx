'use client';

import { cn } from '@/lib/utils';
import { getStatusConfig } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border border-border px-1.5 py-0 text-[10px] font-medium tracking-wide uppercase',
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}
