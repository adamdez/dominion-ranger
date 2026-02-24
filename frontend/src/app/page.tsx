'use client';

import { useState } from 'react';
import {
  Building2, Users, Phone, CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TasksWidget } from '@/components/tasks/tasks-widget';
import { useSystemStats } from '@/hooks/use-system';
import { useLeadStats } from '@/hooks/use-dashboard';
import { usePipelineStats } from '@/hooks/use-pipeline';
import { SCORE_TIERS, DEAL_STAGES } from '@/lib/constants';

type DateRange = '7d' | '30d' | '90d';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const stats = useSystemStats();
  const leadStats = useLeadStats();
  const pipelineStats = usePipelineStats();

  void dateRange;

  if (stats.error) {
    return <ErrorState message="Failed to load dashboard" onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-28 h-7 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
            <SelectItem value="90d">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Properties"
          value={stats.data?.overview?.totalProperties}
          icon={Building2}
          loading={stats.isLoading}
        />
        <StatCard
          title="Active Leads"
          value={leadStats.data?.active}
          icon={Users}
          loading={leadStats.isLoading}
        />
        <StatCard
          title="Dial Ready"
          value={leadStats.data?.dialReady}
          icon={Phone}
          loading={leadStats.isLoading}
        />
        <StatCard
          title="Closed"
          value={leadStats.data?.closedThisMonth}
          icon={CheckCircle}
          loading={leadStats.isLoading}
        />
      </div>

      {/* Pipeline Value + Pending Actions + Tasks */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Pipeline Value */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Pipeline Value</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineStats.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-foreground">
                    ${formatCurrency((pipelineStats.data ?? []).reduce((sum, s) => sum + s.totalValueCents, 0))}
                  </div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                    {(pipelineStats.data ?? []).reduce((sum, s) => sum + s.count, 0)} active leads
                  </p>
                </div>
                <div className="space-y-0">
                  {(pipelineStats.data ?? [])
                    .filter(s => s.totalValueCents > 0 || ['OFFER_MADE', 'UNDER_CONTRACT', 'TITLE_ESCROW'].includes(s.stage))
                    .slice(0, 5)
                    .map(s => {
                      const stageConfig = DEAL_STAGES.find(d => d.key === s.stage);
                      return (
                        <div key={s.stage} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                          <span className="text-[12px] text-muted-foreground">{stageConfig?.label ?? s.stage}</span>
                          <span className="text-[12px] font-mono tabular-nums text-foreground">
                            ${formatCurrency(s.totalValueCents)} ({s.count})
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Pending Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {leadStats.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <div className="space-y-0">
                <ActionRow label="Leads need calls" count={leadStats.data?.dialReady ?? 0} />
                <ActionRow label="Need skip trace" count={0} />
                <ActionRow label="Callbacks due today" count={0} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Widget */}
        <TasksWidget />
      </div>

      {/* Score Distribution + Intelligence Overview */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <ScoreDistribution scoring={stats.data?.scoring ?? null} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Intelligence Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <div className="space-y-0">
                <MetricRow label="Total Events" value={stats.data?.overview?.totalEvents ?? 0} />
                <MetricRow label="Confirmed Signals" value={stats.data?.overview?.confirmedEvents ?? 0} />
                <MetricRow label="Predictive Signals" value={stats.data?.overview?.predictiveEvents ?? 0} />
                <MetricRow label="Promoted Leads" value={stats.data?.overview?.promotedLeads ?? 0} />
                <MetricRow label="Properties w/ Phone" value={stats.data?.overview?.withPhone ?? 0} />
                <MetricRow label="Absentee Owners" value={stats.data?.overview?.absenteeOwners ?? 0} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead Pipeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Lead Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {leadStats.isLoading ? (
            <div className="flex gap-3 flex-wrap">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-24" />)}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(leadStats.data?.byStatus ?? []).map((s: { status: string; count: number }) => (
                <div key={s.status} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  <StatusBadge status={s.status} />
                  <span className="font-mono text-[13px] font-medium tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActionRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">{count}</span>
    </div>
  );
}

function ScoreDistribution({ scoring }: { scoring: { totalScored: number; avgScore: number; maxScore: number } | null }) {
  if (!scoring || scoring.totalScored === 0) {
    return <p className="text-[13px] text-muted-foreground">No scoring data yet. Run scoring first.</p>;
  }

  const tiers = [
    { key: 'A' as const, range: '80–100', barColor: 'bg-emerald-500' },
    { key: 'B' as const, range: '60–79', barColor: 'bg-amber-500' },
    { key: 'C' as const, range: '40–59', barColor: 'bg-orange-500' },
    { key: 'D' as const, range: '0–39', barColor: 'bg-zinc-600' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[11px] text-muted-foreground uppercase tracking-wider">
        <span>Avg: {(scoring.avgScore ?? 0).toFixed(1)}</span>
        <span>Max: {(scoring.maxScore ?? 0).toFixed(1)}</span>
        <span>Scored: {(scoring.totalScored ?? 0).toLocaleString()}</span>
      </div>
      <div className="space-y-2">
        {tiers.map(tier => {
          const config = SCORE_TIERS[tier.key];
          const pct = scoring.totalScored > 0
            ? Math.round((scoring.avgScore >= config.min ? 30 : 15))
            : 0;
          return (
            <div key={tier.key} className="flex items-center gap-3">
              <span className="w-10 text-[11px] font-mono text-muted-foreground">{config.label.replace('Tier ', '')}</span>
              <div className="flex-1 h-2 rounded-sm bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-sm ${tier.barColor} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 text-[11px] font-mono text-right text-muted-foreground">{tier.range}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">{value.toLocaleString()}</span>
    </div>
  );
}

function formatCurrency(cents: number): string {
  if (cents >= 100_000_00) return `${(cents / 100_000_00).toFixed(0)}M`;
  if (cents >= 100_00) return `${(cents / 100_00).toFixed(0)}K`;
  return (cents / 100).toFixed(0);
}
