'use client';

import { useState, useCallback } from 'react';
import { Package, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useFunnelLeads } from '@/hooks/use-funnel';
import type { FunnelLead, LeadWithProperty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

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

export default function DispositionPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<LeadWithProperty | null>(null);

  const { data, isLoading } = useFunnelLeads('disposition', { page, pageSize: 50, search: search || undefined });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1); }, [searchInput]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-emerald-500" />
          <h1 className="text-lg font-semibold">Disposition</h1>
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
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Package} title="No deals in disposition" description="Accepted offers will appear here for buyer assignment" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <DispositionCard
                key={row.leadInstanceId}
                lead={row}
                onView={() => setDetail(toLeadWithProperty(row))}
                onMarkClosed={() => toast.success('Deal closing workflow coming soon')}
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

function DispositionCard({ lead, onView, onMarkClosed }: {
  lead: FunnelLead;
  onView: () => void;
  onMarkClosed: () => void;
}) {
  return (
    <Card className="hover:border-emerald-500/30 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="font-medium text-sm truncate">{lead.streetAddress ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{lead.ownerName ?? 'Unknown owner'}</p>
        </div>

        <div className="flex items-center justify-between">
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
            Finding Buyer
          </Badge>
          <span className="text-xs text-muted-foreground">
            Accepted {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
          </span>
        </div>

        {lead.assignedTo && (
          <p className="text-xs text-muted-foreground">Agent: {lead.assignedTo}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={onMarkClosed}>
            Mark Closed
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onView}>
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
