'use client';

import { useState, useCallback } from 'react';
import { UserCheck, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { FunnelLead, LeadWithProperty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

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

export default function MyLeadsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<LeadWithProperty | null>(null);
  const [offerDialog, setOfferDialog] = useState<FunnelLead | null>(null);
  const [offerAmount, setOfferAmount] = useState('');

  const { data, isLoading } = useFunnelLeads('lead', {
    page,
    pageSize: 50,
    search: search || undefined,
    sort: 'composite_score',
    order: 'desc',
    assignedToMe: true,
  });
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
      sp.set('assignedToMe', 'true');
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
      }>>(`/api/export/funnel/lead?${sp}`);
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
        funnel_stage: p.funnelStage ?? 'lead',
        updated_at: p.updatedAt ?? '',
      }));
      exportToCsv(`my-leads-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch {
      // Error handled by api interceptor
    }
  }, [search]);

  const handleAdvance = useCallback(() => {
    if (!offerDialog || !offerAmount) return;
    const cents = Math.round(parseFloat(offerAmount) * 100);
    if (isNaN(cents) || cents <= 0) { toast.error('Enter a valid amount'); return; }
    advance.mutate(
      { leadInstanceId: offerDialog.leadInstanceId, targetStage: 'negotiation', offerAmountCents: cents },
      { onSuccess: () => { setOfferDialog(null); setOfferAmount(''); toast.success('Moved to Negotiation'); } },
    );
  }, [offerDialog, offerAmount, advance]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <UserCheck className="h-5 w-5 text-emerald-500" />
          <h1 className="text-lg font-semibold">My Leads</h1>
          {pagination && <span className="text-sm text-muted-foreground">({pagination.total})</span>}
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-[220px] pl-8" placeholder="Search..." value={searchInput}
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
            icon={UserCheck}
            title="No leads claimed yet"
            description="Go to Prospects to find and claim leads."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium">Address</TableHead>
                <TableHead className="text-xs font-medium">Owner</TableHead>
                <TableHead className="text-xs font-medium">Score</TableHead>
                <TableHead className="text-xs font-medium">In Stage</TableHead>
                <TableHead className="text-xs font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.leadInstanceId} className="cursor-pointer hover:bg-accent/50 cursor-grab active:cursor-grabbing"
                  onClick={() => setDetail(toLeadWithProperty(row))}
                  draggable
                  onDragStart={(e) => {
                    const dragData: FunnelDragData = { leadInstanceId: row.leadInstanceId, dominionLeadId: row.dominionLeadId, currentStage: row.funnelStage ?? 'lead', address: row.streetAddress ?? '—' };
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
                  <TableCell>
                    <ScoreHoverCard score={row.compositeScore} dominionLeadId={row.dominionLeadId}>
                      <ScoreBadge score={row.compositeScore} />
                    </ScoreHoverCard>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setOfferDialog(row); setOfferAmount(''); }}>
                        To Negotiation
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400"
                        onClick={() => decline.mutate({ leadInstanceId: row.leadInstanceId },
                          { onSuccess: () => toast.success('Declined') })}>
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
              Next<ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!offerDialog} onOpenChange={(open) => { if (!open) setOfferDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move to Negotiation</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{offerDialog?.streetAddress}</p>
            <div>
              <Label>Offer Amount ($)</Label>
              <Input type="number" placeholder="150000" value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialog(null)}>Cancel</Button>
            <Button onClick={handleAdvance} disabled={advance.isPending}>Move to Negotiation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PropertyDetailSheet lead={detail} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}
