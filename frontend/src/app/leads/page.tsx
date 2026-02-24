'use client';

import { useState, useCallback, useMemo } from 'react';
import { Users, Search, X, Save, Trash2, UserPlus, Download } from 'lucide-react';
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScoreBreakdownTooltip, EVENT_LABELS } from '@/components/scoring/score-breakdown-tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useLeads } from '@/hooks/use-leads';
import { useSkipTrace } from '@/hooks/use-skip-trace';
import { useBulkAssign, useBulkSkipTrace } from '@/hooks/use-bulk-actions';
import { useSavedFilters, useCreateSavedFilter, useDeleteSavedFilter } from '@/hooks/use-saved-filters';
import { LEAD_STATUS, getScoreTier } from '@/lib/constants';
import type { LeadWithProperty } from '@/lib/types';
import { ExportCsvButton } from '@/components/ui/export-csv-button';
import type { CsvColumn } from '@/lib/csv-export';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const LEADS_EXPORT_COLUMNS: CsvColumn<LeadWithProperty>[] = [
  { key: 'streetAddress', header: 'Address' },
  { key: 'city', header: 'City' },
  { key: 'county', header: 'County' },
  { key: 'ownerName', header: 'Owner Name' },
  { key: 'compositeScore', header: 'Composite Score' },
  { key: 'motivationScore', header: 'Motivation Score' },
  { key: 'dealScore', header: 'Deal Score' },
  { key: (r) => getScoreTier(r.compositeScore ?? 0), header: 'Tier' },
  { key: 'status', header: 'Status' },
  { key: (r) => (r as LeadWithProperty & { dealStage?: string }).dealStage ?? '', header: 'Stage' },
  { key: 'assignedTo', header: 'Assigned To' },
  { key: 'phone', header: 'Phone' },
  { key: 'email', header: 'Email' },
  { key: (r) => (r.skipTracedAt ? 'Traced' : 'Not traced'), header: 'Skip Trace Status' },
  { key: (r) => (r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : ''), header: 'Created Date' },
];

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignAgent, setAssignAgent] = useState('');

  const savedFilters = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();
  const skipTraceMutation = useSkipTrace();
  const bulkAssignMutation = useBulkAssign();
  const bulkSkipTraceMutation = useBulkSkipTrace();

  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
    sortBy,
    sortOrder,
    view,
  });

  const rows = data?.data ?? [];

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.leadInstanceId)),
    [rows, selectedIds],
  );

  const allPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.leadInstanceId));

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const r of rows) next.delete(r.leadInstanceId);
      } else {
        for (const r of rows) next.add(r.leadInstanceId);
      }
      return next;
    });
  }, [rows, allPageSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const triggerSkipTrace = useCallback((dominionLeadId: string) => {
    skipTraceMutation.mutate({ dominionLeadId, tier: 'STANDARD' });
  }, [skipTraceMutation]);

  const handleBulkAssign = useCallback(() => {
    if (!assignAgent.trim() || selectedRows.length === 0) return;
    bulkAssignMutation.mutate(
      { leadInstanceIds: selectedRows.map((r) => r.leadInstanceId), assignedTo: assignAgent.trim() },
      {
        onSuccess: (result) => {
          toast.success(`Assigned ${result.updated} leads`);
          setAssignDialogOpen(false);
          setAssignAgent('');
          setSelectedIds(new Set());
        },
      },
    );
  }, [assignAgent, selectedRows, bulkAssignMutation]);

  const handleBulkSkipTrace = useCallback(() => {
    const untracedIds = selectedRows
      .filter((r) => !r.skipTracedAt)
      .map((r) => r.dominionLeadId);
    if (untracedIds.length === 0) {
      toast.info('All selected leads are already traced');
      return;
    }
    bulkSkipTraceMutation.mutate(
      { dominionLeadIds: untracedIds },
      {
        onSuccess: (result) => {
          toast.success(`Enqueued ${result.enqueued} leads for skip trace`);
          setSelectedIds(new Set());
        },
      },
    );
  }, [selectedRows, bulkSkipTraceMutation]);

  const handleExportCsv = useCallback(() => {
    if (selectedRows.length === 0) return;
    const header = ['Address', 'Owner', 'County', 'Phone', 'Email', 'Score', 'Status'];
    const csvRows = selectedRows.map((r) => [
      r.streetAddress ?? '',
      r.ownerName ?? '',
      r.county ?? '',
      r.phone ?? '',
      r.email ?? '',
      r.compositeScore?.toString() ?? '',
      r.status,
    ]);
    const csv = [header, ...csvRows].map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedRows.length} leads`);
  }, [selectedRows]);

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
        <ExportCsvButton
          data={rows}
          columns={LEADS_EXPORT_COLUMNS}
          filename="dominion-leads"
          totalCount={data?.pagination.total}
          exportUrl={data && data.pagination.total > rows.length
            ? `/api/leads/export?${[
                status && `status=${encodeURIComponent(status)}`,
                search && `search=${encodeURIComponent(search)}`,
                `sortBy=${sortBy}`,
                `sortOrder=${sortOrder}`,
                view !== 'all' && `view=${view}`,
              ].filter(Boolean).join('&')}`
            : undefined}
        />
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <SortableHeader label="Address" col="streetAddress" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead>Owner</TableHead>
                  <TableHead>County</TableHead>
                  <SortableHeader label="Score" col="compositeScore" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead>Signals</TableHead>
                  <SortableHeader label="Status" col="status" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead>Stage</TableHead>
                  <TableHead>Skip Trace</TableHead>
                  <TableHead>Assigned</TableHead>
                  <SortableHeader label="Updated" col="updatedAt" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((lead) => (
                  <TableRow
                    key={lead.leadInstanceId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLead(lead)}
                    data-state={selectedIds.has(lead.leadInstanceId) ? 'selected' : undefined}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(lead.leadInstanceId)}
                        onCheckedChange={() => toggleOne(lead.leadInstanceId)}
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {lead.streetAddress ?? '\u2014'}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{lead.ownerName ?? '\u2014'}</TableCell>
                    <TableCell>{lead.county ?? '\u2014'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <HoverCard openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <span className="cursor-help inline-flex">
                            <ScoreBadge score={lead.compositeScore} />
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80" side="right">
                          <ScoreBreakdownTooltip
                            compositeScore={lead.compositeScore}
                            motivationScore={lead.motivationScore}
                            dealScore={lead.dealScore}
                            dominionLeadId={lead.dominionLeadId}
                          />
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(lead.topSignals ?? []).slice(0, 3).map((s: string) => (
                          <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">
                            {EVENT_LABELS[s]?.label ?? s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>
                      <DealStageBadge status={lead.status} />
                    </TableCell>
                    <TableCell>
                      <SkipTraceBadge skipTracedAt={lead.skipTracedAt} tier={lead.skipTraceTier} />
                    </TableCell>
                    <TableCell className="text-sm">{lead.assignedTo ?? '\u2014'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!lead.skipTracedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={skipTraceMutation.isPending}
                          onClick={() => triggerSkipTrace(lead.dominionLeadId)}
                        >
                          <Search className="h-3 w-3 mr-1" />
                          Trace
                        </Button>
                      )}
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

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 z-50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setAssignDialogOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Assign
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkSkipTrace}
            disabled={bulkSkipTraceMutation.isPending}
          >
            <Search className="h-3.5 w-3.5 mr-1" /> Skip Trace
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
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

      {/* Bulk Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign {selectedRows.length} Leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="assign-agent">Agent ID</Label>
              <Input
                id="assign-agent"
                value={assignAgent}
                onChange={e => setAssignAgent(e.target.value)}
                placeholder="e.g. agent-001"
                onKeyDown={e => e.key === 'Enter' && handleBulkAssign()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!assignAgent.trim() || bulkAssignMutation.isPending}>
              {bulkAssignMutation.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkipTraceBadge({ skipTracedAt, tier }: { skipTracedAt: string | null; tier: string | null }) {
  if (!skipTracedAt) {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground">Not traced</Badge>;
  }
  return (
    <div className="flex items-center gap-1">
      <Badge variant="secondary" className="text-[10px]">
        {tier === 'tier1' || tier === 'STANDARD' ? 'T1' : tier === 'tier2' || tier === 'ADVANCED' ? 'T2' : 'ST'}
      </Badge>
      <span className="text-[10px] text-muted-foreground">
        {new Date(skipTracedAt).toLocaleDateString()}
      </span>
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
        <span className="ml-1">{order === 'asc' ? '\u2191' : '\u2193'}</span>
      )}
    </TableHead>
  );
}
