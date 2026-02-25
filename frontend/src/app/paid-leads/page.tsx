'use client';

import { useState, useCallback } from 'react';
import { DollarSign, Search, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useFunnelLeads, useFunnelAdvance, useFunnelDecline, useClaimLead } from '@/hooks/use-funnel';
import { FunnelViewToggle, type FunnelView } from '@/components/funnel/funnel-view-toggle';
import { useAuth } from '@/lib/auth-context';
import { useProspects, usePromoteProperties } from '@/hooks/use-prospects';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { FunnelLead, LeadWithProperty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import api from '@/lib/api';

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

export default function PaidLeadsPage() {
  const { user } = useAuth();
  const isAgent = user?.role === 'AGENT';
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<FunnelView>(isAgent ? 'mine' : 'all');
  const [detail, setDetail] = useState<LeadWithProperty | null>(null);
  const [offerDialog, setOfferDialog] = useState<FunnelLead | null>(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [addDialog, setAddDialog] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const { data, isLoading } = useFunnelLeads('paid_lead', { page, pageSize: 50, search: search || undefined, view });
  const advance = useFunnelAdvance();
  const decline = useFunnelDecline();
  const promote = usePromoteProperties();

  const { data: propertyResults } = useProspects({
    page: 1, limit: 10, search: addSearch || undefined,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1); }, [searchInput]);

  const handleAdvance = useCallback(() => {
    if (!offerDialog || !offerAmount) return;
    const cents = Math.round(parseFloat(offerAmount) * 100);
    if (isNaN(cents) || cents <= 0) { toast.error('Enter a valid amount'); return; }
    advance.mutate(
      { leadInstanceId: offerDialog.leadInstanceId, targetStage: 'negotiation', offerAmountCents: cents },
      { onSuccess: () => { setOfferDialog(null); setOfferAmount(''); toast.success('Moved to Negotiation'); } },
    );
  }, [offerDialog, offerAmount, advance]);

  const handleAddPaidLead = useCallback(async (dominionLeadId: string) => {
    try {
      promote.mutate([dominionLeadId], {
        onSuccess: async () => {
          try {
            await api.post('/api/funnel/advance', {
              leadInstanceId: dominionLeadId,
              targetStage: 'paid_lead',
            });
          } catch {
            // The lead was promoted but may need manual stage update
          }
          toast.success('Paid lead added');
          setAddDialog(false);
          setAddSearch('');
        },
      });
    } catch {
      toast.error('Failed to add paid lead');
    }
  }, [promote]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-purple-500" />
          <h1 className="text-lg font-semibold">Paid Leads</h1>
          {pagination && <span className="text-sm text-muted-foreground">({pagination.total})</span>}
        </div>
        <div className="flex items-center gap-2">
          <FunnelViewToggle value={view} onChange={(v) => { setView(v); setPage(1); }} />
          <Button size="sm" onClick={() => setAddDialog(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Paid Lead
          </Button>
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
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={DollarSign} title="No paid leads" description="Add paid leads from webforms or manually" />
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
                <TableRow key={row.leadInstanceId} className="cursor-pointer hover:bg-accent/50"
                  onClick={() => setDetail(toLeadWithProperty(row))}>
                  <TableCell className="max-w-[200px] truncate font-medium text-sm">
                    {row.streetAddress ?? '—'}
                    {row.city && <span className="ml-1 text-xs text-muted-foreground">{row.city}</span>}
                  </TableCell>
                  <TableCell className="text-sm">{row.ownerName ?? '—'}</TableCell>
                  <TableCell><ScoreBadge score={row.compositeScore} /></TableCell>
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
          <span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
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

      {/* Move to Negotiation dialog */}
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

      {/* Add Paid Lead dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Paid Lead</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Search property by address</Label>
              <Input placeholder="123 N Maple St" value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)} />
            </div>
            {addSearch && (propertyResults?.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Property not found in database. Import it first.</p>
            )}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(propertyResults?.data ?? []).map((p) => (
                <button key={p.dominionLeadId}
                  className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => handleAddPaidLead(p.dominionLeadId)}>
                  <span className="font-medium">{p.streetAddress}</span>
                  <span className="ml-2 text-muted-foreground">{p.ownerName}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PropertyDetailSheet lead={detail} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}
