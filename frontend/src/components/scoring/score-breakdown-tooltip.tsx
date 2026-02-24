'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, AlertTriangle, DollarSign, Clock } from 'lucide-react';

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

const SEVERITY_COLOR = {
  high: 'text-red-500 bg-red-500/10',
  medium: 'text-amber-500 bg-amber-500/10',
  low: 'text-blue-500 bg-blue-500/10',
} as const;

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

  const comp = Number(compositeScore) || 0;
  const mot = Number(motivationScore) || 0;
  const deal = Number(dealScore) || 0;

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Score Breakdown</div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Composite
          </span>
          <span className="font-mono font-bold">{comp}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, comp)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Motivation
          </span>
          <span className="font-mono">{mot}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${Math.min(100, mot)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Deal Quality
          </span>
          <span className="font-mono">{deal}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.min(100, deal)}%` }}
          />
        </div>
      </div>

      {signals?.topSignals && signals.topSignals.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Top Distress Signals
          </div>
          {signals.topSignals.slice(0, 5).map((sig, i) => {
            const config = EVENT_LABELS[sig.eventType] ?? { label: sig.eventType, severity: 'low' as const };
            return (
              <div key={i} className="flex items-center justify-between">
                <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLOR[config.severity]}`}>
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
