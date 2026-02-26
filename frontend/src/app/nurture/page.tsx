'use client';

import { useState, useCallback } from 'react';
import { HeartHandshake, Search, ChevronLeft, ChevronRight, Download, ArrowRight } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreHoverCard } from '@/components/scoring/score-breakdown-tooltip';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useFunnelDrag, type FunnelDragData } from '@/lib/funnel-drag-context';
import { useFunnelLeads, useFunnelAdvance, useFunnelDecline } from '@/hooks/use-funnel';
import { exportToCsv } from '@/lib/csv-export';
import api from '@/lib/api';
import { toast } from 'sonner';
import type { FunnelLead, LeadWithProperty } from '@/lib/types';
import { differenceInDays } from 'date-fns';

function toLeadWithProperty(lead: FunnelLead): LeadWithProperty {
  return {
    ...lead,
    phone2: lead.phone2 ?? null,
    phone3: lead.phone3 ?? null,
    phone2Type: null,
    phone3Type: null,
    email2: null,
    skipTraceTier: null,
    skipTracedAt: null,
    skipTraceSource: null,
    eventCount: 0,
  };
}

function formatEquity(val: string | null): string {
  if (!val) return '—';
  const num = parseFloat(val);
  if (num >= 1000) return `$${Math.round(num / 1000)}k`;
  return `$${Math.round(num)}`;
}

export default function NurturePage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<LeadWithProperty | null>(null);

  const { data, isLoading } = useFunnelLeads('nurture', { page, pageSize: 50, search: search || undefined, sort: 'updated_at', order: 'desc' });
  const advance = useFunnelAdvance();
  const decline = useFunnelDecline();

  const { setIsDragging } = useFunnelDrag();
  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1); }, [searchInput]);

  const handleExport = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (search) sp.set('search', search);
      const { data } = await api.get<Array<{
        streetAddress: string | null;
        city: string | null;
        county: string | null;
        ownerName: string | null;
        phone: string | null;
        compositeScore: number | null;
        equityEstimate: string | null;
        assignedTo: string | null;
        funnelStage: string | null;
        updatedAt: string;
      }>>(`/api/export/funnel/nurture?${sp}`);
      const rows = data.map(p => ({
        address: p.streetAddress ?? '',
        city: p.city ?? '',
        county: p.county ?? '',
        owner: p.ownerName ?? '',
        phone: p.phone ?? '',
        score: p.compositeScore ?? '',
        tier: (p.compositeScore ?? 0) >= 65 ? 'A' : (p.compositeScore ?? 0) >= 45 ? 'B' : (p.compositeScore ?? 0) >= 25 ? 'C' : 'D',
        equity: p.equityEstimate ?? '',
        assigned_to: p.assignedTo ?? '',
        funnel_stage: p.funnelStage ?? 'nurture',
        updated_at: p.updatedAt ?? '',
      }));
      exportToCsv(`nurture-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch {
      // Error handled by api interceptor
    }
  }, [search]);

  const handleMoveToLeads = useCallback((row: FunnelLead, e: React.MouseEvent) => {
    e.stopPropagation();
    advance.mutate(
      { leadInstanceId: row.leadInstanceId, targetStage: 'lead' },
      { onSuccess: () => toast.success('Moved to Leads — lead reactivated') },
    );
  }, [advance]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <HeartHandshake className="h-5 w-5 text-teal-500" />
          <h1 className="text-lg font-semibold">Nurture</h1>
          {pagination && <span className="text-sm text-muted-foreground">({pagination.total})</span>}
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-[220px] pl-8" placeholder="Search address or owner..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        </div>
        <Button size="sm" variant="ghost" onClick={handleSearch}>Search</Button>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-6">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No leads in nurture"
            description="Move leads here from Disposition or any funnel stage when they need follow-up."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium">Address</TableHead>
                <TableHead className="text-xs font-medium">Owner</TableHead>
                <TableHead className="text-xs font-medium">County</TableHead>
                <TableHead className="text-xs font-medium">Score</TableHead>
                <TableHead className="text-xs font-medium">Equity</TableHead>
                <TableHead className="text-xs font-medium">Assigned To</TableHead>
                <TableHead className="text-xs font-medium">Last Event</TableHead>
                <TableHead className="text-xs font-medium">Days in Nurture</TableHead>
                <TableHead className="text-xs font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.leadInstanceId} className="cursor-pointer hover:bg-accent/50 cursor-grab active:cursor-grabbing"
                  onClick={() => setDetail(toLeadWithProperty(row))}
                  draggable
                  onDragStart={(e) => {
                    const dragData: FunnelDragData = { leadInstanceId: row.leadInstanceId, dominionLeadId: row.dominionLeadId, currentStage: row.funnelStage ?? 'nurture', address: row.streetAddress ?? '—' };
                    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                    e.dataTransfer.effectAllowed = 'move';
                    e.currentTarget.classList.add('opacity-50');
                    setIsDragging(true);
                  }}
                  onDragEnd={(e) => { e.currentTarget.classList.remove('opacity-50'); setIsDragging(false); }}>
                  <TableCell className="max-w-[200px] truncate font-medium text-sm">
                    {row.streetAddress ?? '—'}
                    {row.city && <span className="ml-1 text-xs text-muted-foreground">{row.city}</span>}
                  </TableCell>
                  <TableCell className="text-sm">{row.ownerName ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.county ?? '—'}</TableCell>
                  <TableCell>
                    <ScoreHoverCard score={row.compositeScore} dominionLeadId={row.dominionLeadId}>
                      <ScoreBadge score={row.compositeScore} />
                    </ScoreHoverCard>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{formatEquity(row.equityEstimate)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.assignedTo ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">—</TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {differenceInDays(new Date(), new Date(row.updatedAt))}d
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        disabled={advance.isPending}
                        onClick={(e) => handleMoveToLeads(row, e)}>
                        <ArrowRight className="h-3 w-3" />
                        Move to Leads
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400"
                        onClick={(e) => { e.stopPropagation(); decline.mutate({ leadInstanceId: row.leadInstanceId }, { onSuccess: () => toast.success('Declined') }); }}>
                        Decline
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />Prev
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <PropertyDetailSheet lead={detail} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}
