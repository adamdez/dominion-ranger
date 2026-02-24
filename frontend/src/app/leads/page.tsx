'use client';

import { useState, useCallback, useEffect } from 'react';
import { Users, Search, X, Save, Trash2, Phone } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLeads } from '@/hooks/use-leads';
import { useSavedFilters, useCreateSavedFilter, useDeleteSavedFilter } from '@/hooks/use-saved-filters';
import { LEAD_STATUS, DEAL_STAGES } from '@/lib/constants';
import type { LeadWithProperty, TopSignal } from '@/lib/types';
import { formatDistanceToNow, differenceInDays } from 'date-fns';

export default function LeadsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewFilter, setViewFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [selectedLead, setSelectedLead] = useState<LeadWithProperty | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);

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
    view: viewFilter,
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
            onClick={() => { setViewFilter(v); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewFilter === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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

        <Select
          value={`${sortBy}-${sortOrder}`}
          onValueChange={(v) => {
            const [col, order] = v.split('-') as [string, 'asc' | 'desc'];
            setSortBy(col);
            setSortOrder(order);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt-desc">Newest First</SelectItem>
            <SelectItem value="createdAt-asc">Oldest First</SelectItem>
            <SelectItem value="compositeScore-desc">Score (High)</SelectItem>
            <SelectItem value="compositeScore-asc">Score (Low)</SelectItem>
            <SelectItem value="updatedAt-desc">Recently Updated</SelectItem>
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
                  <TableHead className="hidden lg:table-cell">Signals</TableHead>
                  <TableHead className="w-20">Skip</TableHead>
                  <TableHead className="hidden xl:table-cell">Equity</TableHead>
                  <SortableHeader label="Status" col="status" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead>Stage</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="hidden xl:table-cell">Days</TableHead>
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
                      <div className="flex items-center gap-2">
                        {lead.streetAddress ?? '—'}
                        <NewBadge createdAt={lead.createdAt} />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{lead.ownerName ?? '—'}</TableCell>
                    <TableCell>{lead.county ?? '—'}</TableCell>
                    <TableCell>
                      <ScoreWithSignals score={lead.compositeScore} signals={lead.topSignals ?? []} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <SignalsCount signals={lead.topSignals ?? []} />
                    </TableCell>
                    <TableCell>
                      <SkipTraceBadge tier={lead.skipTraceTier} phonesFound={lead.phonesFound ?? 0} />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-sm">
                      {formatEquity(lead.equityEstimate)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>
                      <DealStageBadge lead={lead} />
                    </TableCell>
                    <TableCell className="text-sm">{lead.assignedTo ?? '—'}</TableCell>
                    <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                      {differenceInDays(new Date(), new Date(lead.createdAt))}d
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

function SkipTraceBadge({ tier, phonesFound }: { tier: string | null; phonesFound: number }) {
  if (!tier) return <span className="text-muted-foreground">—</span>;
  const isAdvanced = tier === 'ADVANCED';
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
        isAdvanced
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      }`}
    >
      <Phone className="h-3 w-3" />
      {isAdvanced ? 'T1+T2' : 'T1'}
      {phonesFound > 0 && ` (${phonesFound})`}
    </span>
  );
}

function ScoreWithSignals({ score, signals }: { score: number | null; signals: TopSignal[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">
          <ScoreBadge score={score} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1.5">
          <p className="font-semibold">Distress Signals</p>
          {signals.length === 0 ? (
            <p className="text-muted-foreground">No distress signals</p>
          ) : (
            <ul className="space-y-1">
              {signals.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      s.eventLayer === 'CONFIRMED' ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                  />
                  {s.eventType.replace(/_/g, ' ')}
                  <span className="text-muted-foreground">({s.eventLayer})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function NewBadge({ createdAt }: { createdAt: string }) {
  const [isNew, setIsNew] = useState(true);
  useEffect(() => {
    const check = () => {
      const created = new Date(createdAt).getTime();
      const now = Date.now();
      setIsNew(now - created <= 48 * 60 * 60 * 1000);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [createdAt]);
  if (!isNew) return null;
  return (
    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
      NEW
    </span>
  );
}

function SignalsCount({ signals }: { signals: TopSignal[] }) {
  const count = signals.length;
  if (count === 0) return <span className="text-muted-foreground">—</span>;
  return <span className="text-xs">{count} signals</span>;
}

function formatEquity(equity: string | null | undefined): string {
  if (!equity) return '—';
  const num = Number(equity);
  if (Number.isNaN(num)) return equity;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function DealStageBadge({ lead }: { lead: LeadWithProperty }) {
  const dealStage = lead.dealStage ?? mapStatusToDealStage(lead.status);
  const label = DEAL_STAGES.find(s => s.key === dealStage)?.label ?? dealStage;
  return (
    <Badge variant="outline" className="text-xs">
      {label}
    </Badge>
  );
}

function mapStatusToDealStage(status: string): string {
  const mapping: Record<string, string> = {
    PROMOTED: 'NEW_LEAD',
    ASSIGNED: 'NEW_LEAD',
    COMPLIANCE_PENDING: 'NEW_LEAD',
    DIAL_READY: 'NEW_LEAD',
    DIALING: 'CONTACTED',
    CONTACTED: 'CONTACTED',
    OFFER_SENT: 'OFFER_MADE',
    CONTRACTED: 'UNDER_CONTRACT',
    CLOSED: 'CLOSED_WON',
    DEAD: 'CLOSED_LOST',
  };
  return mapping[status] ?? 'NEW_LEAD';
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
