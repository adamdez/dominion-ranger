'use client';

import { Phone, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScoreBreakdownTooltip } from '@/components/scoring/score-breakdown-tooltip';
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
      className="rounded-md border border-border bg-card p-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors space-y-1.5"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[13px] text-foreground leading-tight truncate">
          {lead.streetAddress ?? 'Unknown'}
        </span>
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="cursor-help inline-flex">
                <ScoreBadge score={lead.compositeScore} />
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-72" side="right">
              <ScoreBreakdownTooltip
                compositeScore={lead.compositeScore}
                motivationScore={lead.motivationScore ?? null}
                dealScore={lead.dealScore ?? null}
                dominionLeadId={lead.dominionLeadId}
              />
            </HoverCardContent>
          </HoverCard>
        </span>
      </div>

      <div className="text-[11px] text-muted-foreground truncate">
        {lead.ownerName ?? 'Unknown Owner'}
      </div>

      {lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {lead.tags.slice(0, 3).map(tag => (
            <Badge
              key={tag.tagId}
              variant="outline"
              className="text-[9px] px-1 py-0"
              style={{
                borderColor: tag.color,
                color: tag.color,
              }}
            >
              {tag.name}
            </Badge>
          ))}
          {lead.tags.length > 3 && (
            <span className="text-[9px] text-muted-foreground">
              +{lead.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px]">
        {hasPhone ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <Phone className="h-2.5 w-2.5" />
            {formatPhone(lead.phone!)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            No Phone
          </span>
        )}
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function formatPhone(phone: string): string {
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  return phone;
}
