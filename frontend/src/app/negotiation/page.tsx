'use client';

import { useState, useCallback } from 'react';
import { Handshake, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useFunnelLeads, useFunnelAdvance, useFunnelDecline } from '@/hooks/use-funnel';
import { FunnelViewToggle, type FunnelView } from '@/components/funnel/funnel-view-toggle';
import { useAuth } from '@/lib/auth-context';
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

export default function NegotiationPage() {
  const { user } = useAuth();
  const isAgent = user?.role === 'AGENT';
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<FunnelView>(isAgent ? 'mine' : 'all');
  const [detail, setDetail] = useState<LeadWithProperty | null>(null);

  const { data, isLoading } = useFunnelLeads('negotiation', { page, pageSize: 50, search: search || undefined, view });
  const advance = useFunnelAdvance();
  const decline = useFunnelDecline();

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1); }, [searchInput]);

  const handleAccepted = useCallback((lead: FunnelLead) => {
    advance.mutate(
      { leadInstanceId: lead.leadInstanceId, targetStage: 'disposition', notes: 'Offer accepted' },
      { onSuccess: () => toast.success('Moved to Disposition — find a buyer!') },
    );
  }, [advance]);

  const handleDecline = useCallback((lead: FunnelLead) => {
    decline.mutate(
      { leadInstanceId: lead.leadInstanceId, notes: 'Offer declined' },
      { onSuccess: () => toast.success('Declined — returned to Prospects') },
    );
  }, [decline]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Handshake className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-semibold">Negotiation</h1>
          {pagination && <span className="text-sm text-muted-foreground">({pagination.total})</span>}
        </div>
        <FunnelViewToggle value={view} onChange={(v) => { setView(v); setPage(1); }} />
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

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Handshake} title="No active negotiations" description="Move leads to Negotiation when you make an offer" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <NegotiationCard
                key={row.leadInstanceId}
                lead={row}
                onAccepted={() => handleAccepted(row)}
                onDecline={() => handleDecline(row)}
                onView={() => setDetail(toLeadWithProperty(row))}
              />
            ))}
          </div>
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

      <PropertyDetailSheet lead={detail} open={!!detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function NegotiationCard({
  lead, onAccepted, onDecline, onView,
}: {
  lead: FunnelLead;
  onAccepted: () => void;
  onDecline: () => void;
  onView: () => void;
}) {
  return (
    <Card className="hover:border-amber-500/30 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="font-medium text-sm truncate">{lead.streetAddress ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{lead.ownerName ?? 'Unknown owner'}</p>
        </div>

        <div className="flex items-center justify-between">
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs">
            Negotiating
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
          </span>
        </div>

        {lead.assignedTo && (
          <p className="text-xs text-muted-foreground">Agent: {lead.assignedTo}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={onAccepted}>
            Accepted
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs text-red-400" onClick={onDecline}>
            Decline
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onView}>
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
