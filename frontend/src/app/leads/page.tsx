'use client';

import { useState, useCallback } from 'react';
import { Users, Search, X, Save, Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useLeads } from '@/hooks/use-leads';
import { useSavedFilters, useCreateSavedFilter, useDeleteSavedFilter } from '@/hooks/use-saved-filters';
import { LEAD_STATUS } from '@/lib/constants';
import type { LeadWithProperty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

export default function LeadsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedLead, setSelectedLead] = useState<LeadWithProperty | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'mine' | 'unassigned'>('all');

  const savedFilters = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();

  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
    sortBy,
    sortOrder,
    view,
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const clearFilters = useCallback(() => {
    setStatus('');
    setSearch('');
    setSearchInput('');
    setActiveFilterId(null);
    setPage(1);
  }, []);

  const handleSort = useCallback((col: string) => {
    if (sortBy === col) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
    setPage(1);
  }, [sortBy]);

  const handleSaveFilter = useCallback(() => {
    if (!filterName.trim()) return;
    createFilter.mutate(
      {
        name: filterName.trim(),
        filterConfig: {
          status: status || undefined,
          search: search || undefined,
          sortBy,
          sortOrder,
        },
      },
      {
        onSuccess: () => {
          setFilterName('');
          setSaveDialogOpen(false);
        },
      },
    );
  }, [filterName, status, search, sortBy, sortOrder, createFilter]);

  const handleApplyFilter = useCallback((filterId: string) => {
    if (filterId === 'ALL') {
      clearFilters();
      return;
    }
    const filter = (savedFilters.data ?? []).find(f => f.filterId === filterId);
    if (!filter) return;
    setActiveFilterId(filterId);
    const config = filter.filterConfig;
    setStatus((config.status as string) || '');
    setSearch((config.search as string) || '');
    setSearchInput((config.search as string) || '');
    setSortBy((config.sortBy as string) || 'createdAt');
    setSortOrder((config.sortOrder as 'asc' | 'desc') || 'desc');
    setPage(1);
  }, [savedFilters.data, clearFilters]);

  if (error) {
    return <ErrorState message="Failed to load leads" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      {/* View Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted w-fit">
        {(['all', 'mine', 'unassigned'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { setView(v); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v === 'all' ? 'All Leads' : v === 'mine' ? 'My Leads' : 'Unassigned'}
          </button>
        ))}
      </div>

      {/* Saved Filters Bar */}
      <div className="flex items-center gap-2">
        <Select value={activeFilterId ?? 'ALL'} onValueChange={handleApplyFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Leads" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Leads</SelectItem>
            {(savedFilters.data ?? []).map(f => (
              <SelectItem key={f.filterId} value={f.filterId}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeFilterId && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => {
              if (activeFilterId) deleteFilter.mutate(activeFilterId);
              clearFilters();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search address or owner..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-64"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <Select value={status} onValueChange={(v) => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {Object.entries(LEAD_STATUS).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(status || search) && (
          <>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
              <Save className="mr-1 h-3 w-3" />
              Save Filter
            </Button>
          </>
        )}

        <span className="ml-auto text-sm text-muted-foreground">
          {data?.pagination.total ?? 0} leads
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads found"
          description="No lead instances match your filters. Import properties and run scoring + promotion first."
        />
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="Address" col="streetAddress" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead>Owner</TableHead>
                  <TableHead>County</TableHead>
                  <SortableHeader label="Score" col="compositeScore" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <SortableHeader label="Status" col="status" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead>Stage</TableHead>
                  <TableHead>Assigned</TableHead>
                  <SortableHeader label="Updated" col="updatedAt" current={sortBy} order={sortOrder} onClick={handleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((lead) => (
                  <TableRow
                    key={lead.leadInstanceId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {lead.streetAddress ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{lead.ownerName ?? '—'}</TableCell>
                    <TableCell>{lead.county ?? '—'}</TableCell>
                    <TableCell>
                      <ScoreBadge score={lead.compositeScore} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>
                      <DealStageBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="text-sm">{lead.assignedTo ?? '—'}</TableCell>
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

      <PropertyDetailSheet
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />

      {/* Save Filter Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Filter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="filter-name">Filter Name</Label>
              <Input
                id="filter-name"
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
                placeholder="e.g. Hot Leads"
                onKeyDown={e => e.key === 'Enter' && handleSaveFilter()}
                autoFocus
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Current filters:</p>
              {status && <p>Status: {LEAD_STATUS[status as keyof typeof LEAD_STATUS]?.label ?? status}</p>}
              {search && <p>Search: &ldquo;{search}&rdquo;</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFilter} disabled={!filterName.trim() || createFilter.isPending}>
              {createFilter.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DealStageBadge({ status }: { status: string }) {
  const stageMap: Record<string, string> = {
    PROMOTED: 'New',
    ASSIGNED: 'New',
    COMPLIANCE_PENDING: 'New',
    DIAL_READY: 'New',
    DIALING: 'Contacted',
    CONTACTED: 'Contacted',
    OFFER_SENT: 'Offer Made',
    CONTRACTED: 'Under Contract',
    CLOSED: 'Closed',
    DEAD: 'Lost',
  };
  const label = stageMap[status] ?? status;
  return (
    <Badge variant="outline" className="text-xs">
      {label}
    </Badge>
  );
}

function SortableHeader({
  label, col, current, order, onClick,
}: {
  label: string;
  col: string;
  current: string;
  order: 'asc' | 'desc';
  onClick: (col: string) => void;
}) {
  const isActive = current === col;
  return (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => onClick(col)}
    >
      {label}
      {isActive && (
        <span className="ml-1">{order === 'asc' ? '↑' : '↓'}</span>
      )}
    </TableHead>
  );
}
