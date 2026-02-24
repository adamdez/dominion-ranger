'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  title: string;
  value: number | string | undefined;
  loading?: boolean;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function StatCard({ title, value, loading, description }: StatCardProps) {
  const isZero = value === 0 || value === '0';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-1">
          {loading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <p className={`text-2xl font-semibold font-mono tabular-nums ${isZero ? 'text-muted-foreground' : 'text-foreground'}`}>
              {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
            </p>
          )}
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
