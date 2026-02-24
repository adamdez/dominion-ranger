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
    <span
      className={cn(
        'font-mono font-medium tabular-nums',
        config.textColor,
        size === 'sm' && 'text-[13px]',
        size === 'md' && 'text-sm',
        size === 'lg' && 'text-base',
      )}
    >
      {score !== null ? Math.round(score) : '—'}
    </span>
  );
}
