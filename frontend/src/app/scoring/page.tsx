'use client';

import { useState } from 'react';
import { BarChart3, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { StatCard } from '@/components/ui/stat-card';
import { useScoringStats } from '@/hooks/use-scoring';
import { useLeads } from '@/hooks/use-leads';
import { SCORE_TIERS, getScoreTier } from '@/lib/constants';
import type { LeadWithProperty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

export default function ScoringPage() {
  const [page, setPage] = useState(1);
  const [minScore, setMinScore] = useState<string>('');
  const [county, setCounty] = useState<string>('');
  const [tier, setTier] = useState<string>('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const tierRange = tier
    ? { min: SCORE_TIERS[tier as keyof typeof SCORE_TIERS]?.min ?? 0 }
    : null;

  const effectiveMinScore = tierRange
    ? tierRange.min
    : minScore ? Number(minScore) : undefined;

  const effectiveMaxScore = tierRange
    ? (tier === 'A' ? undefined : tier === 'B' ? 79 : tier === 'C' ? 59 : 39)
    : undefined;

  const stats = useScoringStats();
  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize: 25,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
    minScore: effectiveMinScore,
    maxScore: effectiveMaxScore,
    county: county || undefined,
  });

  const hasFilters = !!minScore || !!county || !!tier;

  const clearFilters = () => {
    setMinScore('');
    setCounty('');
    setTier('');
    setPage(1);
  };

  if (error) {
    return <ErrorState message="Failed to load scoring data" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Properties Scored"
          value={stats.data?.propertiesScored}
          icon={BarChart3}
          loading={stats.isLoading}
        />
        <StatCard
          title="Average Score"
          value={stats.data?.avgScore ? stats.data.avgScore.toFixed(1) : undefined}
          icon={BarChart3}
          loading={stats.isLoading}
        />
        <StatCard
          title="Max Score"
          value={stats.data?.maxScore ? stats.data.maxScore.toFixed(1) : undefined}
          icon={BarChart3}
          loading={stats.isLoading}
        />
        <StatCard
          title="Total Promoted"
          value={stats.data?.totalPromoted}
          icon={BarChart3}
          loading={stats.isLoading}
        />
      </div>

      {/* Tier Overview */}
      {stats.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { tier: 'A' as const, count: stats.data?.tierA ?? 0 },
                { tier: 'B' as const, count: stats.data?.tierB ?? 0 },
                { tier: 'C' as const, count: stats.data?.tierC ?? 0 },
                { tier: 'D' as const, count: stats.data?.belowThreshold ?? 0 },
              ].map(({ tier: t, count }) => (
                <div key={t} className="text-center rounded-lg border p-3">
                  <div className={`inline-block h-3 w-3 rounded-full ${SCORE_TIERS[t].color} mb-2`} />
                  <p className="text-2xl font-bold tabular-nums">{count}</p>
                  <p className="text-xs text-muted-foreground">{SCORE_TIERS[t].label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Min score..."
          type="number"
          value={minScore}
          onChange={(e) => { setMinScore(e.target.value); setTier(''); setPage(1); }}
          className="w-32"
        />
        <Input
          placeholder="County..."
          value={county}
          onChange={(e) => { setCounty(e.target.value.toUpperCase()); setPage(1); }}
          className="w-40"
        />
        <Select value={tier} onValueChange={(v) => { setTier(v === 'ALL' ? '' : v); setMinScore(''); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Tiers</SelectItem>
            <SelectItem value="A">Tier A (80+)</SelectItem>
            <SelectItem value="B">Tier B (60-79)</SelectItem>
            <SelectItem value="C">Tier C (40-59)</SelectItem>
            <SelectItem value="D">Tier D (&lt;40)</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {data?.pagination.total ?? 0} results
        </span>
      </div>

      {/* Leaderboard Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No properties scored yet"
          description="Run batch scoring from the Settings page to populate this leaderboard."
        />
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Composite</TableHead>
                  <TableHead>Motivation</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((lead, idx) => (
                  <LeaderboardRow
                    key={lead.leadInstanceId}
                    lead={lead}
                    rank={(page - 1) * 25 + idx + 1}
                    expanded={expandedRow === lead.leadInstanceId}
                    onToggle={() => setExpandedRow(
                      expandedRow === lead.leadInstanceId ? null : lead.leadInstanceId
                    )}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LeaderboardRow({
  lead,
  rank,
  expanded,
  onToggle,
}: {
  lead: LeadWithProperty;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell className="font-mono text-muted-foreground">{rank}</TableCell>
        <TableCell className="font-medium max-w-[180px] truncate">{lead.streetAddress ?? '—'}</TableCell>
        <TableCell className="max-w-[140px] truncate">{lead.ownerName ?? '—'}</TableCell>
        <TableCell>{lead.county ?? '—'}</TableCell>
        <TableCell><ScoreBadge score={lead.compositeScore} /></TableCell>
        <TableCell><ScoreBadge score={lead.motivationScore} /></TableCell>
        <TableCell><ScoreBadge score={lead.dealScore} /></TableCell>
        <TableCell><span className="text-sm text-muted-foreground">{lead.status}</span></TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
        </TableCell>
        <TableCell>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={10} className="bg-muted/30 p-4">
            <ScoreBreakdown lead={lead} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ScoreBreakdown({ lead }: { lead: LeadWithProperty }) {
  const composite = lead.compositeScore ?? 0;
  const motivation = lead.motivationScore ?? 0;
  const deal = lead.dealScore ?? 0;
  const confidence = lead.confidenceScore ?? 0;
  const tier = getScoreTier(composite);
  const tierConfig = SCORE_TIERS[tier];

  const bars = [
    { label: 'Composite', value: composite, max: 100 },
    { label: 'Motivation', value: motivation, max: 100 },
    { label: 'Deal', value: deal, max: 100 },
    { label: 'Confidence', value: confidence * 100, max: 100 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-3 w-3 rounded-full ${tierConfig.color}`} />
          <span className="font-semibold">{tierConfig.label}</span>
          <span className="text-sm text-muted-foreground">— Score {Math.round(composite)}</span>
        </div>
        {bars.map(bar => {
          const pct = Math.min(Math.round(bar.value), 100);
          const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500';
          return (
            <div key={bar.label}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{bar.label}</span>
                <span>{Math.round(bar.value)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Lead ID</span><span className="font-mono text-xs">{lead.dominionLeadId?.slice(0, 12)}...</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{lead.status}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Assigned To</span><span>{lead.assignedTo ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Events</span><span>{lead.eventCount ?? 0}</span></div>
      </div>
    </div>
  );
}
