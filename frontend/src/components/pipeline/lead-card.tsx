'use client';

import { Phone, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import type { PipelineLead } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface LeadCardProps {
  lead: PipelineLead;
  onClick: () => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const hasPhone = !!lead.phone;

  return (
    <div
      className="rounded-lg border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow space-y-2"
      onClick={onClick}
    >
      <div className="font-medium text-sm leading-tight truncate">
        {lead.streetAddress ?? 'Unknown Address'}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {lead.city ?? '—'}{lead.county ? `, ${lead.county}` : ''}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {lead.ownerName ?? 'Unknown Owner'}
      </div>

      <div className="flex items-center gap-2">
        <ScoreBadge score={lead.compositeScore} />
        <ScoreBar score={lead.compositeScore} />
      </div>

      {lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map(tag => (
            <Badge
              key={tag.tagId}
              variant="outline"
              className="text-[10px] px-1.5 py-0"
              style={{
                borderColor: tag.color,
                color: tag.color,
              }}
            >
              {tag.name}
            </Badge>
          ))}
          {lead.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{lead.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        {hasPhone ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Phone className="h-3 w-3" />
            {formatPhone(lead.phone!)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            No Phone
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {lead.assignedTo && <span>Assigned: {lead.assignedTo}</span>}
        <span className="flex items-center gap-1 ml-auto">
          <Clock className="h-2.5 w-2.5" />
          {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const pct = score ? Math.min(100, Math.max(0, score)) : 0;
  const color =
    pct >= 80 ? 'bg-green-500' :
    pct >= 60 ? 'bg-yellow-500' :
    pct >= 40 ? 'bg-orange-500' :
    'bg-red-500';

  return (
    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatPhone(phone: string): string {
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  return phone;
}
