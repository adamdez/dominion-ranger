'use client';

import { useState } from 'react';
import { BarChart3, X } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { StatCard } from '@/components/ui/stat-card';
import { useScoringStats } from '@/hooks/use-scoring';
import { useLeads } from '@/hooks/use-leads';
import { SCORE_TIERS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';

export default function ScoringPage() {
  const [page, setPage] = useState(1);
  const [minScore, setMinScore] = useState<string>('');

  const stats = useScoringStats();
  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize: 25,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
    minScore: minScore ? Number(minScore) : undefined,
  });

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
            <div className="grid grid-cols-4 gap-4">
              {[
                { tier: 'A' as const, count: stats.data.tierA },
                { tier: 'B' as const, count: stats.data.tierB },
                { tier: 'C' as const, count: stats.data.tierC },
                { tier: 'D' as const, count: stats.data.belowThreshold },
              ].map(({ tier, count }) => (
                <div key={tier} className="text-center rounded-lg border p-3">
                  <div className={`inline-block h-3 w-3 rounded-full ${SCORE_TIERS[tier].color} mb-2`} />
                  <p className="text-2xl font-bold tabular-nums">{count}</p>
                  <p className="text-xs text-muted-foreground">{SCORE_TIERS[tier].label}</p>
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
          onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
          className="w-32"
        />
        {minScore && (
          <Button variant="ghost" size="sm" onClick={() => { setMinScore(''); setPage(1); }}>
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
          title="No scored leads"
          description="Run the scoring engine to populate this leaderboard."
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((lead, idx) => (
                  <TableRow key={lead.leadInstanceId}>
                    <TableCell className="font-mono text-muted-foreground">
                      {(page - 1) * 25 + idx + 1}
                    </TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">
                      {lead.streetAddress ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate">{lead.ownerName ?? '—'}</TableCell>
                    <TableCell>{lead.county ?? '—'}</TableCell>
                    <TableCell><ScoreBadge score={lead.compositeScore} /></TableCell>
                    <TableCell><ScoreBadge score={lead.motivationScore} /></TableCell>
                    <TableCell><ScoreBadge score={lead.dealScore} /></TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{lead.status}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
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
