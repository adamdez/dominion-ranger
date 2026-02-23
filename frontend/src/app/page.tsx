'use client';

import { Building2, Users, Phone, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { useSystemStats } from '@/hooks/use-system';
import { useLeadStats } from '@/hooks/use-dashboard';
import { SCORE_TIERS } from '@/lib/constants';

export default function DashboardPage() {
  const stats = useSystemStats();
  const leadStats = useLeadStats();

  if (stats.error) {
    return <ErrorState message="Failed to load dashboard" onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Properties"
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
          title="Closed This Month"
          value={leadStats.data?.closedThisMonth}
          icon={CheckCircle}
          loading={leadStats.isLoading}
        />
      </div>

      {/* Score Distribution + Intelligence Overview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <ScoreDistribution scoring={stats.data?.scoring ?? null} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intelligence Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
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
        <CardHeader>
          <CardTitle className="text-base">Lead Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {leadStats.isLoading ? (
            <div className="flex gap-4 flex-wrap">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-28" />)}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {(leadStats.data?.byStatus ?? []).map((s: { status: string; count: number }) => (
                <div key={s.status} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <StatusBadge status={s.status} />
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreDistribution({ scoring }: { scoring: { totalScored: number; avgScore: number; maxScore: number } | null }) {
  if (!scoring || scoring.totalScored === 0) {
    return <p className="text-sm text-muted-foreground">No scoring data yet. Run scoring first.</p>;
  }

  const tiers = [
    { key: 'A' as const, range: '80–100' },
    { key: 'B' as const, range: '60–79' },
    { key: 'C' as const, range: '40–59' },
    { key: 'D' as const, range: '0–39' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm text-muted-foreground">
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
              <span className="w-14 text-xs text-muted-foreground">{config.label}</span>
              <div className="flex-1 rounded-full bg-muted h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 text-xs text-right text-muted-foreground">{tier.range}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
