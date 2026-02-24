'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';

export const EVENT_LABELS: Record<string, { label: string; severity: 'high' | 'medium' | 'low' }> = {
  TAX_DELINQUENCY: { label: 'Tax Delinquent', severity: 'high' },
  NOTICE_OF_DEFAULT: { label: 'Notice of Default', severity: 'high' },
  PROBATE: { label: 'Probate', severity: 'high' },
  BANKRUPTCY: { label: 'Bankruptcy', severity: 'high' },
  LIS_PENDENS: { label: 'Lis Pendens', severity: 'high' },
  NOTICE_OF_TRUSTEE_SALE: { label: 'Trustee Sale', severity: 'high' },
  HOA_LIEN: { label: 'HOA Lien', severity: 'medium' },
  TAX_LIEN: { label: 'Tax Lien', severity: 'medium' },
  CODE_ENFORCEMENT: { label: 'Code Violation', severity: 'medium' },
  MECHANIC_LIEN: { label: 'Mechanic Lien', severity: 'medium' },
  JUDGMENT_LIEN: { label: 'Judgment Lien', severity: 'medium' },
  PREDICTIVE_ABSENTEE_DISTRESS: { label: 'Absentee Owner', severity: 'low' },
  PREDICTIVE_VACANCY_SIGNAL: { label: 'Vacant Property', severity: 'medium' },
  PREDICTIVE_DIVORCE_FILING: { label: 'Divorce Filing', severity: 'medium' },
  SHERIFF_SALE: { label: 'Sheriff Sale', severity: 'high' },
};

interface ScoreBreakdownTooltipProps {
  compositeScore: number | null;
  motivationScore: number | null;
  dealScore: number | null;
  dominionLeadId: string;
}

export function ScoreBreakdownTooltip({
  compositeScore,
  motivationScore,
  dealScore,
  dominionLeadId,
}: ScoreBreakdownTooltipProps) {
  const { data: signals } = useQuery({
    queryKey: ['score-breakdown', dominionLeadId],
    queryFn: async () => {
      const { data } = await api.get<{ topSignals?: Array<{ eventType: string; contribution?: number }> }>(
        `/api/properties/${dominionLeadId}/score-breakdown`,
      );
      return data;
    },
    staleTime: 60_000,
  });

  const severityColor = {
    high: 'text-rose-400 bg-rose-500/10',
    medium: 'text-amber-400 bg-amber-500/10',
    low: 'text-zinc-400 bg-zinc-500/10',
  };

  const comp = Number(compositeScore) || 0;
  const mot = Number(motivationScore) || 0;
  const deal = Number(dealScore) || 0;

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Score Breakdown</div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Composite</span>
          <span className="font-mono font-semibold text-foreground">{comp}</span>
        </div>
        <div className="h-1.5 rounded-sm bg-secondary overflow-hidden">
          <div
            className="h-full rounded-sm bg-primary transition-all"
            style={{ width: `${Math.min(100, comp)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Motivation</span>
          <span className="font-mono text-foreground">{mot}</span>
        </div>
        <div className="h-1 rounded-sm bg-secondary overflow-hidden">
          <div
            className="h-full rounded-sm bg-amber-500 transition-all"
            style={{ width: `${Math.min(100, mot)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Deal Quality</span>
          <span className="font-mono text-foreground">{deal}</span>
        </div>
        <div className="h-1 rounded-sm bg-secondary overflow-hidden">
          <div
            className="h-full rounded-sm bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, deal)}%` }}
          />
        </div>
      </div>

      {signals?.topSignals && signals.topSignals.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Top Signals
          </div>
          {signals.topSignals.slice(0, 5).map((sig, i) => {
            const config = EVENT_LABELS[sig.eventType] ?? { label: sig.eventType, severity: 'low' as const };
            return (
              <div key={i} className="flex items-center justify-between">
                <Badge variant="outline" className={`${severityColor[config.severity]}`}>
                  {config.label}
                </Badge>
                <span className="text-[10px] font-mono text-muted-foreground">
                  +{(sig.contribution ?? 0).toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
