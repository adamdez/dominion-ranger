'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useCreateOffer, useSendOffer } from '@/hooks/use-offers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: {
    dominionLeadId: string;
    propertyId: string;
    leadInstanceId?: string;
    address?: string;
    ownerName?: string;
    arvCents?: number;
    rehabEstimateCents?: number;
  };
}

const DEFAULT_CONTINGENCIES = ['inspection', 'title', 'financing'];
const ALL_CONTINGENCIES = ['inspection', 'title', 'financing', 'appraisal'];

function parseDollars(val: string): number {
  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function formatDollarInput(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function NewOfferDialog({ open, onOpenChange, prefill }: Props) {
  const createMut = useCreateOffer();
  const sendMut = useSendOffer();

  const [dominionLeadId, setDominionLeadId] = useState(prefill?.dominionLeadId ?? '');
  const [propertyId, setPropertyId] = useState(prefill?.propertyId ?? '');
  const [leadInstanceId] = useState(prefill?.leadInstanceId ?? '');

  const [offerAmount, setOfferAmount] = useState('');
  const [earnest, setEarnest] = useState('1000');
  const [closingDays, setClosingDays] = useState('21');
  const [inspectionDays, setInspectionDays] = useState('10');
  const [expiryDays, setExpiryDays] = useState('7');

  const [arv, setArv] = useState(prefill?.arvCents ? formatDollarInput(prefill.arvCents) : '');
  const [rehab, setRehab] = useState(prefill?.rehabEstimateCents ? formatDollarInput(prefill.rehabEstimateCents) : '');
  const [assignmentFee, setAssignmentFee] = useState('10000');

  const [contingencies, setContingencies] = useState<string[]>(DEFAULT_CONTINGENCIES);
  const [additionalTerms, setAdditionalTerms] = useState('');
  const [notes, setNotes] = useState('');

  const maxOfferCents = useMemo(() => {
    const a = parseDollars(arv);
    const r = parseDollars(rehab);
    const f = parseDollars(assignmentFee);
    if (!a || !r) return null;
    return Math.round(a * 0.70) - r - f;
  }, [arv, rehab, assignmentFee]);

  const offerCents = parseDollars(offerAmount);
  const overpaying = maxOfferCents !== null && offerCents > maxOfferCents;

  function toggleContingency(c: string) {
    setContingencies(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c],
    );
  }

  async function handleSubmit(andSend: boolean) {
    if (!dominionLeadId || !propertyId || !offerCents) return;

    const offer = await createMut.mutateAsync({
      dominionLeadId,
      propertyId,
      leadInstanceId: leadInstanceId || undefined,
      offerAmountCents: offerCents,
      earnestMoneyCents: parseDollars(earnest),
      closingDays: parseInt(closingDays) || 21,
      inspectionDays: parseInt(inspectionDays) || 10,
      offerExpiryDays: parseInt(expiryDays) || 7,
      contingencies,
      additionalTerms: additionalTerms || undefined,
      arvCents: parseDollars(arv) || undefined,
      rehabEstimateCents: parseDollars(rehab) || undefined,
      assignmentFeeCents: parseDollars(assignmentFee) || undefined,
      notes: notes || undefined,
    });

    if (andSend && offer?.id) {
      await sendMut.mutateAsync(offer.id);
    }

    onOpenChange(false);
  }

  const isPending = createMut.isPending || sendMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Offer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Property association */}
          {!prefill && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Property / Lead IDs</label>
              <Input
                placeholder="Dominion Lead ID"
                value={dominionLeadId}
                onChange={(e) => setDominionLeadId(e.target.value)}
              />
              <Input
                placeholder="Property ID"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              />
            </div>
          )}
          {prefill?.address && (
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm font-medium">{prefill.address}</p>
              {prefill.ownerName && (
                <p className="text-xs text-muted-foreground">Owner: {prefill.ownerName}</p>
              )}
            </div>
          )}

          {/* Offer Terms */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Offer Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                className="pl-7"
                placeholder="85,000"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Earnest Money</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <Input className="pl-7" value={earnest} onChange={(e) => setEarnest(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Closing Days</label>
              <Input value={closingDays} onChange={(e) => setClosingDays(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Inspection Days</label>
              <Input value={inspectionDays} onChange={(e) => setInspectionDays(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Offer Valid For (days)</label>
              <Input value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
            </div>
          </div>

          {/* Deal Analysis */}
          <div className="space-y-2 rounded-lg border p-3">
            <h4 className="text-sm font-medium">Deal Analysis (optional)</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">ARV</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <Input className="pl-6 text-sm" value={arv} onChange={(e) => setArv(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Rehab</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <Input className="pl-6 text-sm" value={rehab} onChange={(e) => setRehab(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Assignment Fee</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <Input className="pl-6 text-sm" value={assignmentFee} onChange={(e) => setAssignmentFee(e.target.value)} />
                </div>
              </div>
            </div>
            {maxOfferCents !== null && (
              <div className={`text-sm font-semibold ${overpaying ? 'text-red-500' : 'text-emerald-500'}`}>
                Max Offer (70% rule): ${(maxOfferCents / 100).toLocaleString('en-US')}
                {overpaying && ' — overpaying!'}
              </div>
            )}
          </div>

          {/* Contingencies */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Contingencies</label>
            <div className="flex flex-wrap gap-4">
              {ALL_CONTINGENCIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={contingencies.includes(c)}
                    onCheckedChange={() => toggleContingency(c)}
                  />
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </label>
              ))}
            </div>
          </div>

          {/* Additional Terms */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Additional Terms</label>
            <Textarea
              rows={2}
              value={additionalTerms}
              onChange={(e) => setAdditionalTerms(e.target.value)}
              placeholder="Any additional terms or conditions..."
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Internal Notes</label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for your team..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={isPending || !offerCents}
            onClick={() => handleSubmit(false)}
          >
            Save as Draft
          </Button>
          <Button
            disabled={isPending || !offerCents}
            onClick={() => handleSubmit(true)}
          >
            Send Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
