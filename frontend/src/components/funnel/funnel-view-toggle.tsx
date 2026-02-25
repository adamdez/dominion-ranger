'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FunnelView = 'mine' | 'unassigned' | 'all';

interface FunnelViewToggleProps {
  value: FunnelView;
  onChange: (view: FunnelView) => void;
}

const views: { key: FunnelView; label: string }[] = [
  { key: 'mine', label: 'My Leads' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All' },
];

export function FunnelViewToggle({ value, onChange }: FunnelViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
      {views.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === v.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
