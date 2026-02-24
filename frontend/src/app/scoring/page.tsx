'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const pageSize = 25;

  const stats = useScoringStats();
  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
    minScore: minScore ? Number(minScore) : undefined,
  });

  if (error) {
    return <ErrorState message="Failed to load scoring data" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Properties Scored"
          value={stats.data?.propertiesScored}
          loading={stats.isLoading}
        />
        <StatCard
          title="Average Score"
          value={stats.data?.avgScore ? stats.data.avgScore.toFixed(1) : undefined}
          loading={stats.isLoading}
        />
        <StatCard
          title="Max Score"
          value={stats.data?.maxScore ? stats.data.maxScore.toFixed(1) : undefined}
          loading={stats.isLoading}
        />
        <StatCard
          title="Total Promoted"
          value={stats.data?.totalPromoted}
          loading={stats.isLoading}
        />
      </div>

      {/* Tier Overview */}
      {stats.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {[
                { tier: 'A' as const, count: stats.data?.tierA ?? 0, barColor: 'bg-emerald-500' },
                { tier: 'B' as const, count: stats.data?.tierB ?? 0, barColor: 'bg-amber-500' },
                { tier: 'C' as const, count: stats.data?.tierC ?? 0, barColor: 'bg-orange-500' },
                { tier: 'D' as const, count: stats.data?.belowThreshold ?? 0, barColor: 'bg-zinc-600' },
              ].map(({ tier, count, barColor }) => (
                <div key={tier} className="space-y-1.5 p-2.5 border border-border rounded-md">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-sm ${barColor}`} />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{SCORE_TIERS[tier].label}</span>
                  </div>
                  <p className="text-xl font-semibold font-mono tabular-nums text-foreground">{count}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Min score..."
          type="number"
          value={minScore}
          onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
          className="w-28 h-7 text-[12px]"
        />
        {minScore && (
          <Button variant="ghost" size="xs" onClick={() => { setMinScore(''); setPage(1); }}>
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-[12px] text-muted-foreground font-mono">
          {data?.pagination.total ?? 0} results
        </span>
      </div>

      {/* Leaderboard Table */}
      {isLoading ? (
        <div className="text-[13px] text-muted-foreground py-8 text-center">Loading...</div>
      ) : data?.data.length === 0 ? (
        <EmptyState
          title="No scored leads"
          description="Run the scoring engine to populate this leaderboard."
        />
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead className="w-10">#</TableHead>
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
                      {(page - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell className="font-medium text-foreground max-w-[180px] truncate">
                      {lead.streetAddress ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[140px] truncate">{lead.ownerName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.county ?? '—'}</TableCell>
                    <TableCell><ScoreBadge score={lead.compositeScore} /></TableCell>
                    <TableCell><ScoreBadge score={lead.motivationScore} /></TableCell>
                    <TableCell><ScoreBadge score={lead.dealScore} /></TableCell>
                    <TableCell>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{lead.status}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground font-mono">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-xs" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
