'use client';

import { Badge } from '@/components/ui/badge';
import type { FunnelStage } from '@/lib/types';

const STAGE_CONFIG: Record<FunnelStage, { label: string; className: string }> = {
  prospect: { label: 'Prospect', className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400' },
  lead: { label: 'Lead', className: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
  paid_lead: { label: 'Paid Lead', className: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
  negotiation: { label: 'Negotiation', className: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  disposition: { label: 'Disposition', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  declined: { label: 'Declined', className: 'border-red-500/30 bg-red-500/10 text-red-400' },
  nurture: { label: 'Nurture', className: 'border-teal-500/30 bg-teal-500/10 text-teal-400' },
};

export function FunnelStageBadge({ stage, declinedCount }: { stage: FunnelStage; declinedCount?: number }) {
  const config = STAGE_CONFIG[stage] ?? STAGE_CONFIG.prospect;
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
      {stage === 'declined' && declinedCount && declinedCount > 1 && ` ×${declinedCount}`}
    </Badge>
  );
}

export { STAGE_CONFIG };
