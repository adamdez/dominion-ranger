'use client';

import { cn } from '@/lib/utils';
import { getStatusConfig } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <Badge
      variant="secondary"
      className={cn(config.color, 'font-medium', className)}
    >
      {config.label}
    </Badge>
  );
}
