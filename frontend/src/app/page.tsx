'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Users, CheckCircle, Handshake, Package, XCircle,
  PhoneCall, SearchCheck, Clock, DollarSign, AlertCircle, Home,
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

import { useTaskStats } from '@/hooks/use-tasks';
import { useOfferStats } from '@/hooks/use-offers';
import { useFunnelStats } from '@/hooks/use-funnel';
import { SCORE_TIERS } from '@/lib/constants';
type DateRange = '7d' | '30d' | '90d';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const stats = useSystemStats();
  const leadStats = useLeadStats();
  const taskStats = useTaskStats();
  const offerStats = useOfferStats();
  const funnelStats = useFunnelStats();

  // Suppress unused-var lint — dateRange reserved for future analytics filtering
  void dateRange;

  if (stats.error) {
    return <ErrorState message="Failed to load dashboard" onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Funnel Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Link href="/prospects" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="Prospects"
            value={funnelStats.data?.prospects ?? stats.data?.overview?.totalProperties}
            icon={Home}
            loading={funnelStats.isLoading}
          />
        </Link>
        <Link href="/leads" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="Active Leads"
            value={funnelStats.data?.leads}
            icon={Users}
            loading={funnelStats.isLoading}
          />
        </Link>
        <Link href="/negotiation" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="In Negotiation"
            value={funnelStats.data?.negotiation}
            icon={Handshake}
            loading={funnelStats.isLoading}
          />
        </Link>
        <Link href="/disposition" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="In Disposition"
            value={funnelStats.data?.disposition}
            icon={Package}
            loading={funnelStats.isLoading}
          />
        </Link>
        <Link href="/prospects" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="Declined"
            value={funnelStats.data?.declined}
            icon={XCircle}
            loading={funnelStats.isLoading}
          />
        </Link>
        <StatCard
          title="Closed This Month"
          value={leadStats.data?.closedThisMonth}
          icon={CheckCircle}
          loading={leadStats.isLoading}
        />
      </div>

      {/* Estimated Pipeline Value */}
      <PipelineValueCard funnelStats={funnelStats.data} loading={funnelStats.isLoading} />

      {/* Task & New Lead Cards — clickable */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/tasks" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="Tasks Due Today"
            value={taskStats.data?.todayPending ?? 0}
            icon={Clock}
            loading={taskStats.isLoading}
          />
        </Link>
        <Link href="/tasks" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="Overdue Tasks"
            value={taskStats.data?.overdue ?? 0}
            icon={AlertCircle}
            loading={taskStats.isLoading}
          />
        </Link>
        <Link href="/leads" className="block transition-opacity hover:opacity-90">
          <StatCard
            title="New Leads (24h)"
            value={leadStats.data?.newLeads24h ?? 0}
            icon={Users}
            loading={leadStats.isLoading}
          />
        </Link>
        <Link href="/negotiation" className="block transition-opacity hover:opacity-90">
          <Card className="p-4">
            {offerStats.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Active Offers</p>
                  <p className="text-xl font-bold tabular-nums">{offerStats.data?.activeCount ?? 0}</p>
                  {(offerStats.data?.totalAmountCents ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {offerStats.data?.activeCount} offers &middot; ${((offerStats.data?.totalAmountCents ?? 0) / 100).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </Link>
      </div>

      {/* Pending Actions + Tasks */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pending Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {leadStats.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                <ActionRow
                  icon={PhoneCall}
                  label="Leads need calls"
                  count={leadStats.data?.dialReady ?? 0}
                  color="text-green-600 dark:text-green-400"
                />
                <ActionRow
                  icon={SearchCheck}
                  label="Need skip trace"
                  count={0}
                  color="text-blue-600 dark:text-blue-400"
                />
                <ActionRow
                  icon={Clock}
                  label="Callbacks due today"
                  count={0}
                  color="text-amber-600 dark:text-amber-400"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Widget */}
        <TasksWidget />
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

function ActionRow({ icon: Icon, label, count, color }: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="font-semibold tabular-nums text-sm">{count}</span>
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const LOW_FEE = 10_000;
const HIGH_FEE = 25_000;

const STAGE_CONFIG = [
  { key: 'prospects',   label: 'Prospects',   conversion: 0.01 },
  { key: 'leads',       label: 'Leads',       conversion: 0.10 },
  { key: 'paidLeads',   label: 'Paid Leads',  conversion: 0.10 },
  { key: 'negotiation', label: 'Negotiation', conversion: 0.50 },
  { key: 'disposition', label: 'Disposition', conversion: 1.00 },
] as const;

function PipelineValueCard({ funnelStats, loading }: {
  funnelStats: { prospects?: number; leads?: number; paidLeads?: number; negotiation?: number; disposition?: number } | undefined;
  loading: boolean;
}) {
  const stages = STAGE_CONFIG.map(s => {
    const count = (funnelStats as Record<string, number> | undefined)?.[s.key] ?? 0;
    return {
      ...s,
      count,
      low: Math.round(count * s.conversion * LOW_FEE),
      high: Math.round(count * s.conversion * HIGH_FEE),
    };
  });

  const totalCount = stages.reduce((sum, s) => sum + s.count, 0);
  const totalLow = stages.reduce((sum, s) => sum + s.low, 0);
  const totalHigh = stages.reduce((sum, s) => sum + s.high, 0);

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Estimated Pipeline Value</div>
          <div className="text-lg font-mono text-emerald-400 mt-1">
            ${formatCompact(totalLow)} – ${formatCompact(totalHigh)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {totalCount.toLocaleString()} total × weighted conversion × $10K–$25K fee
          </div>

          <div className="border-t border-zinc-700/50 mt-3 pt-3 space-y-1.5">
            {stages.map(s => (
              <div key={s.key} className="flex items-center text-xs">
                <span className="text-zinc-500 w-24">{s.label}</span>
                <span className="text-zinc-400 font-mono tabular-nums w-16 text-right">{s.count.toLocaleString()}</span>
                <span className="text-zinc-300 font-mono tabular-nums ml-auto">
                  ${formatCompact(s.low)} – ${formatCompact(s.high)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
