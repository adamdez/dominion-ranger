'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useRespondOffer } from '@/hooks/use-offers';
import type { Offer } from '@/lib/types';

interface Props {
  offer: Offer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResponseStatus = 'accepted' | 'rejected' | 'countered';

function formatDollars(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

export function RespondOfferDialog({ offer, open, onOpenChange }: Props) {
  const respondMut = useRespondOffer();
  const [status, setStatus] = useState<ResponseStatus>('accepted');
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNotes, setCounterNotes] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSubmit() {
    const counterCents = status === 'countered'
      ? Math.round(parseFloat(counterAmount.replace(/[^0-9.]/g, '')) * 100) || undefined
      : undefined;

    await respondMut.mutateAsync({
      offerId: offer.id,
      status,
      counterAmountCents: counterCents,
      counterNotes: status === 'countered' ? counterNotes || undefined : undefined,
      notes: notes || undefined,
    });

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Response</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-sm font-medium">{offer.propertyAddress}</p>
            <p className="text-xs text-muted-foreground">
              Offer: {formatDollars(offer.offerAmountCents)}
              {offer.counterAmountCents && ` · Counter: ${formatDollars(offer.counterAmountCents)}`}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Response</label>
            <div className="flex gap-2">
              {(['accepted', 'rejected', 'countered'] as const).map((s) => (
                <Button
                  key={s}
                  variant={status === s ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatus(s)}
                  className={status === s ? (
                    s === 'accepted' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    s === 'rejected' ? 'bg-red-600 hover:bg-red-700' :
                    'bg-amber-600 hover:bg-amber-700'
                  ) : ''}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {status === 'countered' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium">Counter Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    className="pl-7"
                    placeholder="90,000"
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Counter Notes</label>
                <Textarea
                  rows={2}
                  value={counterNotes}
                  onChange={(e) => setCounterNotes(e.target.value)}
                  placeholder="Seller's counter terms..."
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Notes</label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={respondMut.isPending}>
            Save Response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
