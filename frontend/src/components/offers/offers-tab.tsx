'use client';

import { DollarSign, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useOffers } from '@/hooks/use-offers';
import { OfferCalculator } from '@/components/offers/offer-calculator';
import type { LeadWithProperty, Offer, OfferStatus } from '@/lib/types';

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

function formatDollars(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface OfferPrefill {
  maoAmountCents: number;
  arvCents: number;
  rehabCents: number;
  assignmentFeeCents: number;
}

interface Props {
  lead: LeadWithProperty;
  onNewOffer: (prefill?: OfferPrefill) => void;
}

export function OffersTab({ lead, onNewOffer }: Props) {
  const offersQuery = useOffers({ dominionLeadId: lead.dominionLeadId, limit: 50 });
  const offers = offersQuery.data?.offers ?? [];

  const handleMakeOfferFromCalc = (
    maoAmountCents: number,
    arvCents: number,
    rehabCents: number,
    assignmentFeeCents: number,
  ) => {
    onNewOffer({ maoAmountCents, arvCents, rehabCents, assignmentFeeCents });
  };

  return (
    <div className="space-y-6">
      <OfferCalculator
        dominionLeadId={lead.dominionLeadId}
        onMakeOffer={handleMakeOfferFromCalc}
      />

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-muted-foreground">
            OFFER HISTORY{offers.length > 0 ? ` (${offers.length})` : ''}
          </h4>
          <Button size="sm" variant="outline" onClick={() => onNewOffer()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Offer
          </Button>
        </div>

        {offersQuery.isLoading && (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        )}

        {!offersQuery.isLoading && offers.length === 0 && (
          <div className="rounded-lg border p-4 text-center">
            <p className="text-xs text-muted-foreground">No offers sent yet</p>
          </div>
        )}

        <div className="space-y-2">
          {offers.map((offer: Offer) => {
            const status = offer.status as OfferStatus;
            return (
              <div
                key={offer.id}
                className={`rounded-lg border p-3 space-y-1 ${status === 'accepted' ? 'border-emerald-500/50' : ''} ${
                  ['rejected', 'expired', 'withdrawn'].includes(status) ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold tabular-nums text-sm">
                    {formatDollars(offer.offerAmountCents)}
                  </span>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Badge>
                </div>
                {offer.counterAmountCents && (
                  <p className="text-xs text-amber-500">Counter: {formatDollars(offer.counterAmountCents)}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {offer.sentAt ? `Sent ${formatDate(offer.sentAt)}` : `Created ${formatDate(offer.createdAt)}`}
                  {offer.expiresAt && status === 'sent' && ` · Expires ${formatDate(offer.expiresAt)}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
