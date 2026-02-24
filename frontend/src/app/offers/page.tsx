'use client';

import { useState } from 'react';
import {
  DollarSign, Plus, Send, Trash2,
  ArrowLeftRight, X, Download, Eye,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useOffers, useSendOffer, useDeleteOffer, useRespondOffer,
} from '@/hooks/use-offers';
import { NewOfferDialog } from '@/components/offers/new-offer-dialog';
import { RespondOfferDialog } from '@/components/offers/respond-offer-dialog';
import type { Offer, OfferStatus } from '@/lib/types';
import api from '@/lib/api';

const STATUS_COLORS: Record<OfferStatus, string> = {
  draft: 'bg-zinc-500',
  sent: 'bg-blue-500',
  viewed: 'bg-cyan-500',
  countered: 'bg-amber-500',
  accepted: 'bg-emerald-500',
  rejected: 'bg-red-500',
  expired: 'bg-zinc-600',
  withdrawn: 'bg-zinc-600',
};

const STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  countered: 'Countered',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

function formatDollars(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function OffersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [newOfferOpen, setNewOfferOpen] = useState(false);
  const [respondOffer, setRespondOffer] = useState<Offer | null>(null);

  const offersQuery = useOffers({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    page,
    limit: 25,
  });

  const sendMut = useSendOffer();
  const deleteMut = useDeleteOffer();
  const respondMut = useRespondOffer();

  const offers = offersQuery.data?.offers ?? [];
  const total = offersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  async function handleDownloadPdf(offer: Offer) {
    const response = await api.get(`/api/offers/${offer.id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offer-${offer.propertyAddress.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Offers</h1>
        <Button onClick={() => setNewOfferOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New Offer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="countered">Countered</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            placeholder="Search address or owner..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-64"
          />
          {search && (
            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {offersQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      )}

      {/* Empty */}
      {!offersQuery.isLoading && offers.length === 0 && (
        <EmptyState
          icon={DollarSign}
          title="No offers yet"
          description="Create your first offer to start tracking deals."
        />
      )}

      {/* Offer Cards */}
      <div className="grid gap-3">
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            onSend={() => sendMut.mutate(offer.id)}
            onDelete={() => deleteMut.mutate(offer.id)}
            onRespond={() => setRespondOffer(offer)}
            onWithdraw={() => respondMut.mutate({ offerId: offer.id, status: 'withdrawn' })}
            onDownloadPdf={() => handleDownloadPdf(offer)}
            onEdit={() => {/* handled by dialog */}}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <NewOfferDialog open={newOfferOpen} onOpenChange={setNewOfferOpen} />

      {respondOffer && (
        <RespondOfferDialog
          offer={respondOffer}
          open={!!respondOffer}
          onOpenChange={(open) => { if (!open) setRespondOffer(null); }}
        />
      )}
    </div>
  );
}

function OfferCard({ offer, onSend, onDelete, onRespond, onWithdraw, onDownloadPdf }: {
  offer: Offer;
  onSend: () => void;
  onDelete: () => void;
  onRespond: () => void;
  onWithdraw: () => void;
  onDownloadPdf: () => void;
  onEdit: () => void;
}) {
  const status = offer.status as OfferStatus;
  const isDimmed = ['rejected', 'expired', 'withdrawn'].includes(status);
  const isAccepted = status === 'accepted';

  return (
    <Card className={`transition-colors ${isDimmed ? 'opacity-60' : ''} ${isAccepted ? 'border-emerald-500/50' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">
                {offer.propertyAddress}
                {offer.propertyCity && `, ${offer.propertyCity}`}
                {offer.propertyState && `, ${offer.propertyState}`}
                {offer.propertyZip && ` ${offer.propertyZip}`}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Owner: {offer.ownerName ?? 'Unknown'}
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-semibold tabular-nums">{formatDollars(offer.offerAmountCents)}</span>
              <Badge variant="outline" className="gap-1 text-xs">
                <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
                {STATUS_LABELS[status]}
              </Badge>
              {offer.counterAmountCents && status === 'countered' && (
                <span className="text-amber-500 text-xs font-medium">
                  Counter: {formatDollars(offer.counterAmountCents)}
                </span>
              )}
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              {status === 'draft' && (
                <span>Created: {formatDate(offer.createdAt)}</span>
              )}
              {offer.sentAt && <span>Sent: {formatDate(offer.sentAt)}</span>}
              {offer.expiresAt && status === 'sent' && (
                <span>Expires: {formatDate(offer.expiresAt)}</span>
              )}
              {offer.respondedAt && <span>Responded: {formatDate(offer.respondedAt)}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {status === 'draft' && (
              <>
                <Button variant="ghost" size="sm" onClick={onSend}>
                  <Send className="mr-1 h-3.5 w-3.5" /> Send
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
            {(status === 'sent' || status === 'viewed') && (
              <>
                {offer.pdfUrl && (
                  <Button variant="ghost" size="sm" onClick={onDownloadPdf}>
                    <Download className="mr-1 h-3.5 w-3.5" /> PDF
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onRespond}>
                  <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Respond
                </Button>
                <Button variant="ghost" size="sm" onClick={onWithdraw}>
                  <X className="mr-1 h-3.5 w-3.5" /> Withdraw
                </Button>
              </>
            )}
            {status === 'countered' && (
              <>
                {offer.pdfUrl && (
                  <Button variant="ghost" size="sm" onClick={onDownloadPdf}>
                    <Download className="mr-1 h-3.5 w-3.5" /> PDF
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onRespond}>
                  <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Respond
                </Button>
              </>
            )}
            {status === 'accepted' && offer.pdfUrl && (
              <Button variant="ghost" size="sm" onClick={onDownloadPdf}>
                <Download className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
            )}
            {isDimmed && offer.pdfUrl && (
              <Button variant="ghost" size="sm" onClick={onDownloadPdf}>
                <Eye className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
