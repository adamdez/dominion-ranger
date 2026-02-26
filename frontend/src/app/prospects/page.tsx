'use client';

import { useState, useCallback } from 'react';
import {
  Home,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  UserPlus,
  Download,
  SearchCheck,
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { ScoreHoverCard } from '@/components/scoring/score-breakdown-tooltip';
import { useProspects, useCounties, usePromoteProperties } from '@/hooks/use-prospects';
import { useBulkResolveContacts } from '@/hooks/use-contact-resolver';
import { exportToCsv } from '@/lib/csv-export';
import api from '@/lib/api';
import { useFunnelDrag, type FunnelDragData } from '@/lib/funnel-drag-context';
import { getScoreTier, SCORE_TIERS } from '@/lib/constants';
import type { Prospect, LeadWithProperty } from '@/lib/types';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type SortField = 'composite_score' | 'equity_estimate' | 'last_event' | 'street_address' | 'owner_name' | 'county';

export default function ProspectsPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortField>('composite_score');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [tier, setTier] = useState<string>('A');
  const [county, setCounty] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<LeadWithProperty | null>(null);

  const { data, isLoading, error } = useProspects({
    page,
    limit: 50,
    sort,
    order,
    tier: tier !== 'all' ? tier : undefined,
    county: county || undefined,
    search: searchTerm || undefined,
  });

  const { data: counties } = useCounties();
  const promote = usePromoteProperties();
  const bulkResolve = useBulkResolveContacts();

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSort = useCallback((field: SortField) => {
    if (sort === field) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  }, [sort]);

  const handleSearch = useCallback(() => {
    setSearchTerm(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleExport = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (tier && tier !== 'all') sp.set('tier', tier);
      if (county) sp.set('county', county);
      if (searchTerm) sp.set('search', searchTerm);
      const { data } = await api.get<Array<{
        streetAddress: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        county: string | null;
        ownerName: string | null;
        phone: string | null;
        compositeScore: number | null;
        equityEstimate: string | null;
        mortgageStatus: string | null;
        signalCount: number | null;
        lastEventDate: string | null;
      }>>(`/api/export/prospects?${sp}`);
      const rows = data.map(p => ({
        address: p.streetAddress ?? '',
        city: p.city ?? '',
        state: p.state ?? '',
        zip: p.zip ?? '',
        county: p.county ?? '',
        owner: p.ownerName ?? '',
        phone: p.phone ?? '',
        score: p.compositeScore ?? '',
        tier: (p.compositeScore ?? 0) >= 65 ? 'A' : (p.compositeScore ?? 0) >= 45 ? 'B' : (p.compositeScore ?? 0) >= 25 ? 'C' : 'D',
        equity: p.equityEstimate ?? '',
        mortgage_status: p.mortgageStatus ?? '',
        signal_count: p.signalCount ?? 0,
        last_event: p.lastEventDate ?? '',
      }));
      exportToCsv(`prospects-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch {
      // Error handled by api interceptor
    }
  }, [tier, county, searchTerm]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.dominionLeadId)));
    }
  }, [rows, selected.size]);

  const handlePromote = useCallback(() => {
    const ids = Array.from(selected).filter(id => {
      const row = rows.find(r => r.dominionLeadId === id);
      return row && !row.leadInstanceId;
    });
    if (ids.length === 0) return;
    promote.mutate(ids, {
      onSuccess: () => setSelected(new Set()),
    });
  }, [selected, rows, promote]);

  const openDetail = useCallback((row: Prospect) => {
    setDetailLead({
      leadInstanceId: row.leadInstanceId ?? row.dominionLeadId,
      dominionLeadId: row.dominionLeadId,
      status: row.leadStatus ?? 'PROMOTED',
      assignedTo: null,
      complianceCleared: false,
      version: 1,
      createdAt: '',
      updatedAt: '',
      notes: null,
      streetAddress: row.streetAddress,
      city: row.city,
      county: row.county,
      ownerName: row.ownerName,
      phone: row.phone,
      phone2: null,
      phone3: null,
      phoneType: null,
      phone2Type: null,
      phone3Type: null,
      email: null,
      email2: null,
      skipTraceTier: null,
      skipTracedAt: null,
      skipTraceSource: null,
      compositeScore: row.compositeScore,
      motivationScore: row.motivationScore,
      dealScore: row.dealScore,
      confidenceScore: row.confidenceScore,
      eventCount: row.signalCount ?? 0,
    });
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return order === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3" />
      : <ChevronDown className="ml-1 h-3 w-3" />;
  };

  const formatEquity = (val: string | null) => {
    if (!val) return '—';
    const num = parseFloat(val);
    if (num >= 1000) return `$${Math.round(num / 1000)}k`;
    return `$${Math.round(num)}`;
  };

  const promotableCount = Array.from(selected).filter(id => {
    const row = rows.find(r => r.dominionLeadId === id);
    return row && !row.leadInstanceId;
  }).length;

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load prospects" onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Home className="h-5 w-5 text-emerald-500" />
          <h1 className="text-lg font-semibold">Prospects</h1>
          {pagination && (
            <span className="text-sm text-muted-foreground">
              ({pagination.total.toLocaleString()})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkResolve.isPending}
                  >
                    <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
                    {bulkResolve.isPending
                      ? 'Skip Tracing...'
                      : `Skip Trace (${selected.size})`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Skip Trace {selected.size} Properties</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will skip trace {selected.size} propert{selected.size === 1 ? 'y' : 'ies'} using
                      BatchData at $0.01 each = <span className="font-semibold">${(selected.size * 0.01).toFixed(2)}</span>.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        bulkResolve.mutate({
                          dominionLeadIds: Array.from(selected),
                          tier: 'basic',
                        }, { onSuccess: () => setSelected(new Set()) });
                      }}
                    >
                      Confirm — Skip Trace
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                size="sm"
                onClick={handlePromote}
                disabled={promotableCount === 0 || promote.isPending}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Promote {promotableCount > 0 ? `(${promotableCount})` : ''}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <Select value={tier} onValueChange={(v) => { setTier(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Score Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="A">Tier A (65+)</SelectItem>
            <SelectItem value="B">Tier B (45-64)</SelectItem>
            <SelectItem value="C">Tier C (25-44)</SelectItem>
            <SelectItem value="D">Tier D (&lt;25)</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={county || '__all__'}
          onValueChange={(v) => { setCounty(v === '__all__' ? '' : v); setPage(1); }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="County" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Counties</SelectItem>
            {(counties ?? []).map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-[220px] pl-8"
              placeholder="Search address or owner..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={handleSearch}>
            Search
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Home}
            title="No prospects found"
            description="Try adjusting your filters or search terms"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === rows.length && rows.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>
                  <button
                    className="flex items-center text-xs font-medium"
                    onClick={() => handleSort('street_address')}
                  >
                    Address <SortIcon field="street_address" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="flex items-center text-xs font-medium"
                    onClick={() => handleSort('owner_name')}
                  >
                    Owner <SortIcon field="owner_name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="flex items-center text-xs font-medium"
                    onClick={() => handleSort('county')}
                  >
                    County <SortIcon field="county" />
                  </button>
                </TableHead>
                <TableHead className="text-xs font-medium w-16">Type</TableHead>
                <TableHead>
                  <button
                    className="flex items-center text-xs font-medium"
                    onClick={() => handleSort('composite_score')}
                  >
                    Score <SortIcon field="composite_score" />
                  </button>
                </TableHead>
                <TableHead className="text-xs font-medium">Tier</TableHead>
                <TableHead>
                  <button
                    className="flex items-center text-xs font-medium"
                    onClick={() => handleSort('equity_estimate')}
                  >
                    Equity <SortIcon field="equity_estimate" />
                  </button>
                </TableHead>
                <TableHead className="text-xs font-medium">Signals</TableHead>
                <TableHead>
                  <button
                    className="flex items-center text-xs font-medium"
                    onClick={() => handleSort('last_event')}
                  >
                    Last Event <SortIcon field="last_event" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ProspectRow
                  key={row.dominionLeadId}
                  row={row}
                  isSelected={selected.has(row.dominionLeadId)}
                  onToggle={() => toggleSelect(row.dominionLeadId)}
                  onClick={() => openDetail(row)}
                  formatEquity={formatEquity}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <span className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.pageSize) + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Property Detail Sheet */}
      <PropertyDetailSheet
        lead={detailLead}
        open={!!detailLead}
        onClose={() => setDetailLead(null)}
      />
    </div>
  );
}

function ProspectRow({
  row,
  isSelected,
  onToggle,
  onClick,
  formatEquity,
}: {
  row: Prospect;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  formatEquity: (val: string | null) => string;
}) {
  const tier = getScoreTier(row.compositeScore);
  const tierConfig = SCORE_TIERS[tier];
  const { setIsDragging } = useFunnelDrag();

  const dragData: FunnelDragData = {
    leadInstanceId: null,
    dominionLeadId: row.dominionLeadId,
    currentStage: 'prospect',
    address: row.streetAddress ?? '—',
  };

  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/50 cursor-grab active:cursor-grabbing"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('opacity-50');
        setIsDragging(true);
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('opacity-50');
        setIsDragging(false);
      }}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className="max-w-[200px] truncate font-medium text-sm">
        {row.streetAddress ?? '—'}
        {row.city && (
          <span className="ml-1 text-xs text-muted-foreground">{row.city}</span>
        )}
      </TableCell>
      <TableCell className="max-w-[150px] truncate text-sm">
        {row.ownerName ?? '—'}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.county ?? '—'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.propertyType ?? '—'}
      </TableCell>
      <TableCell>
        <ScoreHoverCard score={row.compositeScore} dominionLeadId={row.dominionLeadId}>
          <ScoreBadge score={row.compositeScore} />
        </ScoreHoverCard>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`text-xs ${tierConfig.textColor}`}
        >
          {tier}
        </Badge>
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {formatEquity(row.equityEstimate)}
      </TableCell>
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {row.signalCount ?? 0}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.lastEventDate
          ? new Date(row.lastEventDate).toLocaleDateString()
          : '—'}
      </TableCell>
    </TableRow>
  );
}
