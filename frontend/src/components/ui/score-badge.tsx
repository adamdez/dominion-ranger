'use client';

import { cn } from '@/lib/utils';
import { getScoreTier, SCORE_TIERS } from '@/lib/constants';

interface ScoreBadgeProps {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const tier = getScoreTier(score);
  const config = SCORE_TIERS[tier];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          'rounded-full',
          config.color,
          size === 'sm' && 'h-2 w-2',
          size === 'md' && 'h-2.5 w-2.5',
          size === 'lg' && 'h-3 w-3',
        )}
      />
      <span
        className={cn(
          'font-semibold',
          config.textColor,
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-lg',
        )}
      >
        {score !== null ? Math.round(score) : '—'}
      </span>
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}
