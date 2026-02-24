'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  Users,
  LayoutGrid,
  Search,
  X,
  Save,
  Trash2,
  UserPlus,
  Download,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScoreBreakdownTooltip, EVENT_LABELS } from '@/components/scoring/score-breakdown-tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { LeadCard } from '@/components/pipeline/lead-card';
import { useLeads } from '@/hooks/use-leads';
import { useDealStageTransition } from '@/hooks/use-pipeline';
import { useSkipTrace } from '@/hooks/use-skip-trace';
import { useBulkAssign, useBulkSkipTrace } from '@/hooks/use-bulk-actions';
import { useSavedFilters, useCreateSavedFilter, useDeleteSavedFilter } from '@/hooks/use-saved-filters';
import { LEAD_STATUS, DEAL_STAGES, getScoreTier } from '@/lib/constants';
import type { LeadWithProperty, PipelineLead } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

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

export default function PipelinePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams.get('view');
  const filterParam = searchParams.get('filter');

  const [view, setView] = useState<'table' | 'board'>(viewParam === 'board' ? 'board' : 'table');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [leadView, setLeadView] = useState<'all' | 'mine' | 'unassigned'>(
    filterParam === 'unassigned' ? 'unassigned' : 'all'
  );
  const [selectedLead, setSelectedLead] = useState<LeadWithProperty | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignAgent, setAssignAgent] = useState('');
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  useEffect(() => {
    if (viewParam === 'board') setView('board');
    if (filterParam === 'unassigned') setLeadView('unassigned');
  }, [viewParam, filterParam]);

  const savedFilters = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();
  const skipTraceMutation = useSkipTrace();
  const bulkAssignMutation = useBulkAssign();
  const bulkSkipTraceMutation = useBulkSkipTrace();
  const dealStageTransition = useDealStageTransition();

  const tableQuery = useLeads({
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
    sortBy,
    sortOrder,
    view: leadView,
  });

  const pipelineQuery = useLeads({
    page: 1,
    pageSize: 200,
    status: status || undefined,
    search: search || undefined,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
    view: leadView,
  });

  const tableData = tableQuery.data;
  const pipelineData = pipelineQuery.data;
  const pipelineLeads = (pipelineData?.data ?? []).map((lead) => ({
    ...lead,
    dealStage: (lead as LeadWithProperty & { dealStage?: string }).dealStage ?? mapStatusToDealStage(lead.status),
    tags: (lead as PipelineLead).tags ?? [],
  }));
  const rows = tableData?.data ?? [];
  const isLoading = view === 'table' ? tableQuery.isLoading : pipelineQuery.isLoading;
  const error = view === 'table' ? tableQuery.error : pipelineQuery.error;

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.leadInstanceId)),
    [rows, selectedIds],
  );
  const allPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.leadInstanceId));

  const columns = useMemo(() => {
    const grouped: Record<string, PipelineLead[]> = {};
    for (const stage of DEAL_STAGES) {
      grouped[stage.key] = [];
    }
    for (const lead of pipelineLeads) {
      const stage = optimisticMoves[lead.leadInstanceId] ?? lead.dealStage ?? mapStatusToDealStage(lead.status);
      const pipelineLead: PipelineLead = {
        ...lead,
        dealStage: stage,
        tags: (lead as PipelineLead).tags ?? [],
      };
      if (grouped[stage]) {
        grouped[stage].push(pipelineLead);
      } else {
        grouped['NEW_LEAD'].push(pipelineLead);
      }
    }
    return grouped;
  }, [pipelineLeads, optimisticMoves]);

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
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
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
        filterConfig: { status: status || undefined, search: search || undefined, sortBy, sortOrder },
      },
      { onSuccess: () => { setFilterName(''); setSaveDialogOpen(false); } },
    );
  }, [filterName, status, search, sortBy, sortOrder, createFilter]);

  const handleApplyFilter = useCallback((filterId: string) => {
    if (filterId === 'ALL') {
      clearFilters();
      return;
    }
    const filter = (savedFilters.data ?? []).find((f) => f.filterId === filterId);
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
    const untracedIds = selectedRows.filter((r) => !r.skipTracedAt).map((r) => r.dominionLeadId);
    if (untracedIds.length === 0) {
      toast.info('All selected leads are already traced');
      return;
    }
    bulkSkipTraceMutation.mutate(
      { dominionLeadIds: untracedIds },
      { onSuccess: (result) => { toast.success(`Enqueued ${result.enqueued} leads for skip trace`); setSelectedIds(new Set()); } },
    );
  }, [selectedRows, bulkSkipTraceMutation]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const fromStage = result.source.droppableId;
    const toStage = result.destination.droppableId;
    if (fromStage === toStage) return;
    const leadId = result.draggableId;
    setOptimisticMoves((prev) => ({ ...prev, [leadId]: toStage }));
    dealStageTransition.mutate(
      { leadInstanceId: leadId, stage: toStage },
      {
        onError: () => setOptimisticMoves((prev) => { const n = { ...prev }; delete n[leadId]; return n; }),
        onSuccess: () => setOptimisticMoves((prev) => { const n = { ...prev }; delete n[leadId]; return n; }),
      },
    );
  }, [dealStageTransition]);

  if (error) {
    return <ErrorState message="Failed to load pipeline" onRetry={() => (view === 'table' ? tableQuery.refetch() : pipelineQuery.refetch())} />;
  }

  return (
    <div className="space-y-4">
      {/* Top bar: title + view toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted w-fit">
          <Button
            variant={view === 'table' ? 'default' : 'ghost'}
            size="sm"
            className={view === 'table' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => {
              setView('table');
              router.replace('/pipeline');
            }}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Table
          </Button>
          <Button
            variant={view === 'board' ? 'default' : 'ghost'}
            size="sm"
            className={view === 'board' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => {
              setView('board');
              router.replace('/pipeline?view=board');
            }}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Board
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-muted w-fit">
        {(['all', 'mine', 'unassigned'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { setLeadView(v); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              leadView === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v === 'all' ? 'All Leads' : v === 'mine' ? 'My Leads' : 'Unassigned'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Select value={activeFilterId ?? 'ALL'} onValueChange={handleApplyFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Leads" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Leads</SelectItem>
            {(savedFilters.data ?? []).map((f) => (
              <SelectItem key={f.filterId} value={f.filterId}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeFilterId && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (activeFilterId) deleteFilter.mutate(activeFilterId); clearFilters(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search address or owner..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="mr-1 h-3 w-3" />Clear</Button>
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}><Save className="mr-1 h-3 w-3" />Save Filter</Button>
          </>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {view === 'table' ? (tableData?.pagination.total ?? 0) : pipelineLeads.length} leads
        </span>
        {view === 'table' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const data = rows;
              const header = ['Address', 'City', 'County', 'Owner', 'Score', 'Tier', 'Status', 'Stage', 'Assigned', 'Phone', 'Email'];
              const csvRows = data.map((r) => [
                r.streetAddress ?? '',
                r.city ?? '',
                r.county ?? '',
                r.ownerName ?? '',
                r.compositeScore?.toString() ?? '',
                getScoreTier(r.compositeScore ?? 0),
                r.status,
                (r as LeadWithProperty & { dealStage?: string }).dealStage ?? '',
                r.assignedTo ?? '',
                r.phone ?? '',
                r.email ?? '',
              ]);
              const csv = [header, ...csvRows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `dominion-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
              toast.success(`Exported ${data.length} leads`);
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        )}
        {view === 'board' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const header = ['Address', 'Owner', 'County', 'Stage', 'Score', 'Tier', 'Assigned'];
              const csvRows = pipelineLeads.map((r) => [
                r.streetAddress ?? '',
                r.ownerName ?? '',
                r.county ?? '',
                r.dealStage ?? '',
                r.compositeScore?.toString() ?? '',
                getScoreTier(r.compositeScore ?? 0),
                r.assignedTo ?? '',
              ]);
              const csv = [header, ...csvRows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `dominion-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
              toast.success(`Exported ${pipelineLeads.length} leads`);
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Table View */}
      {view === 'table' && (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} title="No leads found" description="No lead instances match your filters." />
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"><Checkbox checked={allPageSelected} onCheckedChange={toggleAll} /></TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('streetAddress')}>Address {sortBy === 'streetAddress' && (sortOrder === 'asc' ? '↑' : '↓')}</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>County</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('compositeScore')}>Score {sortBy === 'compositeScore' && (sortOrder === 'asc' ? '↑' : '↓')}</TableHead>
                      <TableHead>Signals</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>Status {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Skip Trace</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('updatedAt')}>Updated {sortBy === 'updatedAt' && (sortOrder === 'asc' ? '↑' : '↓')}</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((lead) => (
                      <TableRow key={lead.leadInstanceId} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLead(lead)}>
                        <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selectedIds.has(lead.leadInstanceId)} onCheckedChange={() => toggleOne(lead.leadInstanceId)} /></TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{lead.streetAddress ?? '—'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{lead.ownerName ?? '—'}</TableCell>
                        <TableCell>{lead.county ?? '—'}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild><span className="cursor-help inline-flex"><ScoreBadge score={lead.compositeScore} /></span></HoverCardTrigger>
                            <HoverCardContent className="w-80" side="right">
                              <ScoreBreakdownTooltip compositeScore={lead.compositeScore} motivationScore={lead.motivationScore} dealScore={lead.dealScore} dominionLeadId={lead.dominionLeadId} />
                            </HoverCardContent>
                          </HoverCard>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(lead.topSignals ?? []).slice(0, 3).map((s: string) => (
                              <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{EVENT_LABELS[s]?.label ?? s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={lead.status} /></TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{((lead as LeadWithProperty & { dealStage?: string }).dealStage ?? lead.status) === 'CONTACTED' ? 'Contacted' : 'New'}</Badge></TableCell>
                        <TableCell>{lead.skipTracedAt ? <Badge variant="secondary" className="text-[10px]">Traced</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Not traced</Badge>}</TableCell>
                        <TableCell className="text-sm">{lead.assignedTo ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {!lead.skipTracedAt && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={skipTraceMutation.isPending} onClick={() => skipTraceMutation.mutate({ dominionLeadId: lead.dominionLeadId, tier: 'STANDARD' })}>
                              <Search className="h-3 w-3 mr-1" />Trace
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {tableData && tableData.pagination.totalPages > 1 && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Page {tableData.pagination.page} of {tableData.pagination.totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= tableData.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Board View */}
      {view === 'board' && (
        <>
          {isLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {DEAL_STAGES.map((s) => (
                <div key={s.key} className="w-72 shrink-0 space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ))}
            </div>
          ) : pipelineLeads.length === 0 ? (
            <EmptyState icon={LayoutGrid} title="Pipeline is empty" description="Import properties, run scoring, and promote leads to populate the pipeline." />
          ) : (
            <div className="flex flex-col h-[calc(100vh-12rem)]">
              <ScrollArea className="flex-1 min-h-0 w-full">
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="flex gap-3 pb-4 min-w-max px-1">
                    {DEAL_STAGES.map((stage) => {
                      const cards = columns[stage.key] ?? [];
                      return (
                        <div key={stage.key} className={`w-72 shrink-0 rounded-lg border ${stage.color} flex flex-col`}>
                          <div className="p-3 border-b space-y-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold">{stage.label}</h3>
                              <span className="text-xs font-medium text-muted-foreground rounded-full bg-background px-2 py-0.5">{cards.length}</span>
                            </div>
                          </div>
                          <Droppable droppableId={stage.key}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`flex-1 p-2 space-y-2 min-h-[120px] transition-colors ${snapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
                              >
                                {cards.map((lead, index) => (
                                  <Draggable key={lead.leadInstanceId} draggableId={lead.leadInstanceId} index={index}>
                                    {(dragProvided, dragSnapshot) => (
                                      <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps} className={dragSnapshot.isDragging ? 'opacity-90 rotate-1' : ''}>
                                        <LeadCard lead={lead} onClick={() => setSelectedLead(lead as LeadWithProperty)} />
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      );
                    })}
                  </div>
                </DragDropContext>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}
        </>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 z-50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setAssignDialogOpen(true)}><UserPlus className="h-3.5 w-3.5 mr-1" /> Assign</Button>
          <Button size="sm" variant="outline" onClick={handleBulkSkipTrace} disabled={bulkSkipTraceMutation.isPending}><Search className="h-3.5 w-3.5 mr-1" /> Skip Trace</Button>
          <Button size="sm" variant="outline" onClick={() => { const csv = [['Address','Owner','County','Phone','Email','Score','Status'], ...selectedRows.map((r) => [r.streetAddress ?? '', r.ownerName ?? '', r.county ?? '', r.phone ?? '', r.email ?? '', r.compositeScore?.toString() ?? '', r.status])].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href); toast.success(`Exported ${selectedIds.size} leads`); }}><Download className="h-3.5 w-3.5 mr-1" /> Export CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      <PropertyDetailSheet lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Save Filter</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="filter-name">Filter Name</Label>
              <Input id="filter-name" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="e.g. Hot Leads" onKeyDown={(e) => e.key === 'Enter' && handleSaveFilter()} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFilter} disabled={!filterName.trim() || createFilter.isPending}>{createFilter.isPending ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign {selectedRows.length} Leads</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="assign-agent">Agent ID</Label>
              <Input id="assign-agent" value={assignAgent} onChange={(e) => setAssignAgent(e.target.value)} placeholder="e.g. agent-001" onKeyDown={(e) => e.key === 'Enter' && handleBulkAssign()} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!assignAgent.trim() || bulkAssignMutation.isPending}>{bulkAssignMutation.isPending ? 'Assigning...' : 'Assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
