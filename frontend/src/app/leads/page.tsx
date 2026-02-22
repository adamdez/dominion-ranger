'use client';

import { useState, useCallback } from 'react';
import { Users, Search, X } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LeadDetailSheet } from '@/components/leads/lead-detail-sheet';
import { useLeads } from '@/hooks/use-leads';
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

  const { data, isLoading, error, refetch } = useLeads({
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
    sortBy,
    sortOrder,
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const clearFilters = useCallback(() => {
    setStatus('');
    setSearch('');
    setSearchInput('');
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

  if (error) {
    return <ErrorState message="Failed to load leads" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
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
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
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
                    <TableCell className="text-sm">{lead.assignedTo ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <LeadDetailSheet
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
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
