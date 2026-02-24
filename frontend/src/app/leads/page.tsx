'use client';

import { useState, useCallback, useMemo } from 'react';
import { Users, Search, X, Save, Trash2, UserPlus, Download, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { LEAD_STATUS } from '@/lib/constants';
import type { LeadWithProperty } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

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
  const pageSize = 50;

  const savedFilters = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();
  const skipTraceMutation = useSkipTrace();
  const bulkAssignMutation = useBulkAssign();
  const bulkSkipTraceMutation = useBulkSkipTrace();

  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize,
    status: status || undefined,
    search: search || undefined,
    sortBy,
    sortOrder,
    view,
  });

  const rows = useMemo(() => data?.data ?? [], [data?.data]);

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

  const rangeStart = data ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = data ? Math.min(page * pageSize, data.pagination.total) : 0;
  const total = data?.pagination.total ?? 0;

  return (
    <div className="space-y-3">
      {/* View Filter Tabs */}
      <div className="flex items-center gap-0.5">
        {(['all', 'mine', 'unassigned'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { setView(v); setPage(1); }}
            className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
              view === v ? 'bg-white/5 text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v === 'all' ? 'All Leads' : v === 'mine' ? 'My Leads' : 'Unassigned'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Search address or owner..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-56 h-7 text-[12px]"
          />
          <Button variant="ghost" size="icon-xs" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Select value={status} onValueChange={(v) => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36 h-7 text-[12px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {Object.entries(LEAD_STATUS).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilterId ?? 'ALL'} onValueChange={handleApplyFilter}>
          <SelectTrigger className="w-36 h-7 text-[12px]">
            <SelectValue placeholder="Saved Filters" />
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
            size="icon-xs"
            className="text-destructive"
            onClick={() => {
              if (activeFilterId) deleteFilter.mutate(activeFilterId);
              clearFilters();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}

        {(status || search) && (
          <>
            <Button variant="ghost" size="xs" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSaveDialogOpen(true)}>
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-[13px] text-muted-foreground py-8 text-center">Loading...</div>
      ) : data?.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads found"
          description="Import properties and run scoring + promotion."
        />
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead className="w-8">
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
                  <TableHead>Traced</TableHead>
                  <TableHead>Assigned</TableHead>
                  <SortableHeader label="Updated" col="updatedAt" current={sortBy} order={sortOrder} onClick={handleSort} />
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((lead) => (
                  <TableRow
                    key={lead.leadInstanceId}
                    className="cursor-pointer"
                    onClick={() => setSelectedLead(lead)}
                    data-state={selectedIds.has(lead.leadInstanceId) ? 'selected' : undefined}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(lead.leadInstanceId)}
                        onCheckedChange={() => toggleOne(lead.leadInstanceId)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground max-w-[180px] truncate">
                      {lead.streetAddress ?? '\u2014'}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[130px] truncate">{lead.ownerName ?? '\u2014'}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.county ?? '\u2014'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <HoverCard openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <span className="cursor-help inline-flex">
                            <ScoreBadge score={lead.compositeScore} />
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72" side="right">
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
                      <div className="flex flex-wrap gap-0.5">
                        {(lead.topSignals ?? []).slice(0, 3).map((s: string) => (
                          <Badge key={s} variant="outline" className="text-[9px] px-1 py-0">
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
                    <TableCell className="text-muted-foreground">{lead.assignedTo ?? '\u2014'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!lead.skipTracedAt && (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={skipTraceMutation.isPending}
                          onClick={() => triggerSkipTrace(lead.dominionLeadId)}
                        >
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
              <span className="text-[12px] text-muted-foreground font-mono">
                {rangeStart}–{rangeEnd} of {total}
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

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-card border border-border rounded-md px-3 py-2 flex items-center gap-2 z-50">
          <span className="text-[12px] font-mono font-medium">{selectedIds.size} selected</span>
          <Button size="xs" variant="ghost" className="border border-border" onClick={() => setAssignDialogOpen(true)}>
            <UserPlus className="h-3 w-3 mr-1" /> Assign
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="border border-border"
            onClick={handleBulkSkipTrace}
            disabled={bulkSkipTraceMutation.isPending}
          >
            <Search className="h-3 w-3 mr-1" /> Trace
          </Button>
          <Button size="xs" variant="ghost" className="border border-border" onClick={handleExportCsv}>
            <Download className="h-3 w-3 mr-1" /> CSV
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3 w-3" />
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
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <p>Current filters:</p>
              {status && <p>Status: {LEAD_STATUS[status as keyof typeof LEAD_STATUS]?.label ?? status}</p>}
              {search && <p>Search: &ldquo;{search}&rdquo;</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveFilter} disabled={!filterName.trim() || createFilter.isPending}>
              {createFilter.isPending ? '...' : 'Save'}
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
            <Button variant="ghost" size="sm" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleBulkAssign} disabled={!assignAgent.trim() || bulkAssignMutation.isPending}>
              {bulkAssignMutation.isPending ? '...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkipTraceBadge({ skipTracedAt, tier }: { skipTracedAt: string | null; tier: string | null }) {
  if (!skipTracedAt) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  return (
    <span className="text-[10px] font-mono text-muted-foreground">
      {tier === 'tier1' || tier === 'STANDARD' ? 'T1' : tier === 'tier2' || tier === 'ADVANCED' ? 'T2' : 'ST'}
    </span>
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
    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
      {label}
    </span>
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
        <span className="ml-0.5 text-[10px]">{order === 'asc' ? '\u2191' : '\u2193'}</span>
      )}
    </TableHead>
  );
}
