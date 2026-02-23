'use client';

import { Building2, Users, Phone, CheckCircle, DollarSign, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useSystemStats } from '@/hooks/use-system';
import { useLeadStats } from '@/hooks/use-dashboard';
import { useScoringStats } from '@/hooks/use-scoring';
import { SCORE_TIERS } from '@/lib/constants';

export default function DashboardPage() {
  const stats = useSystemStats();
  const leadStats = useLeadStats();
  const scoringStats = useScoringStats();

  if (stats.error && leadStats.error) {
    return <ErrorState message="Failed to load dashboard" onRetry={() => { stats.refetch(); leadStats.refetch(); }} />;
  }

  const isEmpty = !stats.isLoading && !leadStats.isLoading
    && (stats.data?.overview?.totalProperties ?? 0) === 0
    && (leadStats.data?.total ?? 0) === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={Building2}
        title="Welcome to Dominion Ranger"
        description="Import properties to get started. Run scoring and promotion to populate your pipeline."
      />
    );
  }

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Revenue Pace"
          value="$0"
          icon={DollarSign}
          loading={false}
          description="Based on closed deals this month"
        />
        <StatCard
          title="Stale Leads"
          value={leadStats.data?.staleCount ?? 0}
          icon={Clock}
          loading={leadStats.isLoading}
          description="No activity in 5+ days"
        />
        <StatCard
          title="Promoted"
          value={leadStats.data?.promoted}
          icon={Activity}
          loading={leadStats.isLoading}
        />
        <StatCard
          title="Properties w/ Phone"
          value={stats.data?.overview?.withPhone}
          icon={Phone}
          loading={stats.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {scoringStats.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <ScoreDistribution
                scoring={scoringStats.data ?? null}
              />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {leadStats.isLoading ? (
              <div className="flex gap-4 flex-wrap">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-28" />)}
              </div>
            ) : (leadStats.data?.byStatus ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads in pipeline yet.</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {leadStats.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (leadStats.data?.recentActivity ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="space-y-2">
                {(leadStats.data?.recentActivity ?? []).map((a: { leadInstanceId: string; status: string; updatedAt: string }, idx: number) => (
                  <div key={`${a.leadInstanceId}-${idx}`} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <StatusBadge status={a.status} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.updatedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScoreDistribution({ scoring }: { scoring: { propertiesScored?: number; tierA?: number; tierB?: number; tierC?: number; belowThreshold?: number; avgScore?: number; maxScore?: number } | null }) {
  if (!scoring || (scoring.propertiesScored ?? 0) === 0) {
    return <p className="text-sm text-muted-foreground">No scoring data yet. Run scoring from Settings.</p>;
  }

  const total = (scoring.tierA ?? 0) + (scoring.tierB ?? 0) + (scoring.tierC ?? 0) + (scoring.belowThreshold ?? 0);
  const tiers = [
    { key: 'A' as const, count: scoring.tierA ?? 0 },
    { key: 'B' as const, count: scoring.tierB ?? 0 },
    { key: 'C' as const, count: scoring.tierC ?? 0 },
    { key: 'D' as const, count: scoring.belowThreshold ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Avg: {(scoring.avgScore ?? 0).toFixed(1)}</span>
        <span>Max: {(scoring.maxScore ?? 0).toFixed(1)}</span>
        <span>Scored: {(scoring.propertiesScored ?? 0).toLocaleString()}</span>
      </div>
      <div className="space-y-2">
        {tiers.map(tier => {
          const config = SCORE_TIERS[tier.key];
          const pct = total > 0 ? Math.round((tier.count / total) * 100) : 0;
          return (
            <div key={tier.key} className="flex items-center gap-3">
              <span className="w-14 text-xs text-muted-foreground">{config.label}</span>
              <div className="flex-1 rounded-full bg-muted h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.color} transition-all duration-500`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="w-16 text-xs text-right tabular-nums text-muted-foreground">
                {tier.count} ({pct}%)
              </span>
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
