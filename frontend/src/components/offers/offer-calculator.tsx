'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, MapPin, TrendingUp, DollarSign, Target, ArrowRight } from 'lucide-react';
import { useCompAnalysis } from '@/hooks/use-comp-analysis';
import type { CompAnalysisResult, CompQuality, RankedComp } from '@/hooks/use-comp-analysis';
import { format } from 'date-fns';

interface OfferCalculatorProps {
  dominionLeadId: string;
  onMakeOffer: (maoAmountCents: number, arvCents: number, rehabCents: number, assignmentFeeCents: number) => void;
}

function formatUsd(dollars: number): string {
  return '$' + dollars.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function parseDollarInput(val: string): number {
  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

const QUALITY_CONFIG: Record<CompQuality, { label: string; color: string; dots: number }> = {
  excellent: { label: 'Excellent', color: 'text-emerald-500', dots: 3 },
  good: { label: 'Good', color: 'text-blue-500', dots: 3 },
  fair: { label: 'Fair', color: 'text-yellow-500', dots: 2 },
  poor: { label: 'Poor', color: 'text-red-500', dots: 1 },
  no_data: { label: 'No Data', color: 'text-zinc-500', dots: 0 },
};

function QualityBadge({ quality, compCount }: { quality: CompQuality; compCount: number }) {
  const cfg = QUALITY_CONFIG[quality];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      <span className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`inline-block h-2 w-2 rounded-full ${i <= cfg.dots ? 'bg-current' : 'bg-muted'}`}
          />
        ))}
      </span>
      {cfg.label} ({compCount}/3 within range)
    </div>
  );
}

function CompRow({
  comp,
  isTopThree,
  subjectSqft,
}: {
  comp: { address: string; salePrice: number; saleDate: string; sqft: number; beds: number; baths: number; distanceMiles: number; yearBuilt: number };
  isTopThree: boolean;
  subjectSqft: number;
}) {
  const sqftDiff = Math.abs(comp.sqft - subjectSqft);
  const sign = comp.sqft >= subjectSqft ? '+' : '-';
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 text-xs border-b last:border-b-0 ${
        isTopThree ? 'border-l-2 border-l-emerald-500 bg-emerald-500/5' : 'border-l-2 border-l-transparent opacity-60'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{comp.address}</p>
        <p className="text-muted-foreground">
          {comp.beds}bd/{comp.baths}ba · {comp.sqft.toLocaleString()}sqft ({sign}{sqftDiff}) · {comp.yearBuilt}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-semibold tabular-nums">{formatUsd(comp.salePrice)}</p>
        <p className="text-muted-foreground">
          {comp.distanceMiles.toFixed(2)}mi · {comp.saleDate ? format(new Date(comp.saleDate), 'MM/dd/yy') : '—'}
        </p>
      </div>
    </div>
  );
}

export function OfferCalculator({ dominionLeadId, onMakeOffer }: OfferCalculatorProps) {
  const analysisMutation = useCompAnalysis();
  const [analysis, setAnalysis] = useState<CompAnalysisResult | null>(null);

  const [arvOverride, setArvOverride] = useState('');
  const [dispositionPct, setDispositionPct] = useState(70);
  const [repairsInput, setRepairsInput] = useState('0');
  const [assignmentFeeInput, setAssignmentFeeInput] = useState('10000');

  useEffect(() => {
    if (analysisMutation.data) {
      setAnalysis(analysisMutation.data);
      setArvOverride('');
    }
  }, [analysisMutation.data]);

  const handleRunComps = (forceFresh = false) => {
    analysisMutation.mutate({
      dominionLeadId,
      forceFresh,
      radiusMiles: 1.0,
      searchMonths: 12,
    });
  };

  const arv = useMemo(() => {
    if (arvOverride) return parseDollarInput(arvOverride);
    return analysis?.arv ?? 0;
  }, [arvOverride, analysis?.arv]);

  const repairs = parseDollarInput(repairsInput);
  const assignmentFee = parseDollarInput(assignmentFeeInput);

  const buyersPrice = useMemo(() => Math.round(arv * (dispositionPct / 100)), [arv, dispositionPct]);
  const mao = useMemo(() => Math.max(0, buyersPrice - repairs - assignmentFee), [buyersPrice, repairs, assignmentFee]);

  const bestThreeAddresses = useMemo(
    () => new Set((analysis?.bestThree ?? []).map((c) => c.address)),
    [analysis?.bestThree],
  );

  const allCompsSorted = useMemo(() => {
    if (!analysis) return [];
    const ranked = new Map(analysis.bestThree.map((c) => [c.address, c.score]));
    return [...analysis.allComps].sort((a, b) => {
      const aRanked = ranked.has(a.address);
      const bRanked = ranked.has(b.address);
      if (aRanked && !bRanked) return -1;
      if (!aRanked && bRanked) return 1;
      if (aRanked && bRanked) return (ranked.get(a.address) ?? 0) - (ranked.get(b.address) ?? 0);
      return a.distanceMiles - b.distanceMiles;
    });
  }, [analysis]);

  if (!analysis && !analysisMutation.isPending) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-8 text-center space-y-3">
          <Target className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm font-medium">Offer Calculator</p>
            <p className="text-xs text-muted-foreground mt-1">
              Run comps to analyze comparable sales and calculate your maximum allowable offer.
            </p>
          </div>
          <Button onClick={() => handleRunComps(false)}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Run Comp Analysis
          </Button>
        </div>
      </div>
    );
  }

  if (analysisMutation.isPending && !analysis) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── COMP ANALYSIS ─── */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <h4 className="text-sm font-semibold tracking-wide text-muted-foreground">COMP ANALYSIS</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRunComps(true)}
            disabled={analysisMutation.isPending}
            className="h-7 text-xs"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${analysisMutation.isPending ? 'animate-spin' : ''}`} />
            {analysisMutation.isPending ? 'Running...' : 'Run Comps'}
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {analysis?.warning && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠ {analysis.warning}
            </div>
          )}

          {analysis && analysis.bestThree.length > 0 && (
            <>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Best 3 Comps:</p>
                {analysis.bestThree.map((comp: RankedComp) => (
                  <div
                    key={comp.address}
                    className="flex items-center gap-2 text-xs rounded-md bg-muted/30 px-3 py-2"
                  >
                    <span className="font-bold text-emerald-500 w-5">#{comp.rank}</span>
                    <span className="flex-1 truncate font-medium">{comp.address}</span>
                    <span className="text-muted-foreground shrink-0">{comp.distanceBucket}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {comp.sqft.toLocaleString()}sqft
                    </span>
                    <span className="font-semibold tabular-nums shrink-0">
                      {formatUsd(comp.salePrice)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">ARV (avg of {analysis.bestThree.length}):</span>{' '}
                    <span className="font-bold text-base">{formatUsd(analysis.arv)}</span>
                  </p>
                </div>
                <QualityBadge quality={analysis.quality} compCount={analysis.bestThree.length} />
              </div>
            </>
          )}

          {analysis && analysis.bestThree.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No comparable sales found within parameters. You can enter ARV manually below.
            </p>
          )}

          {analysis?.cachedAt && (
            <p className="text-[10px] text-muted-foreground">
              Data from {format(new Date(analysis.cachedAt), 'MMM d, yyyy h:mm a')}
              {analysis.cached ? ' (cached)' : ''}
            </p>
          )}
        </div>
      </div>

      {/* ─── OFFER CALCULATOR ─── */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h4 className="text-sm font-semibold tracking-wide text-muted-foreground">OFFER CALCULATOR</h4>
        </div>

        <div className="p-4 space-y-4">
          {/* ARV */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">ARV (After Repair Value)</label>
              {arvOverride && analysis?.arv ? (
                <button
                  className="text-[10px] text-blue-500 hover:underline"
                  onClick={() => setArvOverride('')}
                >
                  Reset to {formatUsd(analysis.arv)}
                </button>
              ) : null}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                className="pl-7 h-9 text-sm font-semibold tabular-nums"
                value={arvOverride || (arv > 0 ? arv.toLocaleString() : '')}
                onChange={(e) => setArvOverride(e.target.value)}
                placeholder="Enter ARV..."
              />
            </div>
          </div>

          {/* Disposition % */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Disposition Rule</label>
              <span className="text-sm font-semibold tabular-nums">{dispositionPct}%</span>
            </div>
            <Slider
              value={[dispositionPct]}
              onValueChange={([v]) => setDispositionPct(v)}
              min={60}
              max={85}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>60%</span>
              <span>Buyer&apos;s Price: {arv > 0 ? formatUsd(buyersPrice) : '—'}</span>
              <span>85%</span>
            </div>
          </div>

          <Separator />

          {/* Repairs */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Est. Repairs</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                className="pl-7 h-9 text-sm tabular-nums"
                value={repairsInput}
                onChange={(e) => setRepairsInput(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Assignment Fee */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Assignment Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                className="pl-7 h-9 text-sm tabular-nums"
                value={assignmentFeeInput}
                onChange={(e) => setAssignmentFeeInput(e.target.value)}
                placeholder="10,000"
              />
            </div>
          </div>

          <Separator />

          {/* Results */}
          <div className="space-y-2 rounded-lg bg-muted/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Buyer&apos;s Price</span>
              <span className="font-medium tabular-nums">
                {arv > 0 ? formatUsd(buyersPrice) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">− Repairs</span>
              <span className="font-medium tabular-nums">{formatUsd(repairs)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">− Assignment Fee</span>
              <span className="font-medium tabular-nums">{formatUsd(assignmentFee)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">YOUR OFFER (MAO)</span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  mao > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}
              >
                {arv > 0 ? formatUsd(mao) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">YOUR PROFIT</span>
              <span className="text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {formatUsd(assignmentFee)}
              </span>
            </div>
          </div>

          {arv > 0 && mao > 0 && (
            <Button
              className="w-full"
              onClick={() =>
                onMakeOffer(
                  Math.round(mao * 100),
                  Math.round(arv * 100),
                  Math.round(repairs * 100),
                  Math.round(assignmentFee * 100),
                )
              }
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Make Offer at {formatUsd(mao)}
            </Button>
          )}
        </div>
      </div>

      {/* ─── COMP MAP (placeholder) + ALL COMPS LIST ─── */}
      {analysis && allCompsSorted.length > 0 && (
        <div className="rounded-lg border">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h4 className="text-sm font-semibold tracking-wide text-muted-foreground">
              ALL COMPARABLE SALES ({analysis.compCount})
            </h4>
          </div>

          <div className="bg-muted/20 p-4 border-b">
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                Map view coming soon — requires Mapbox or Google Maps API key
              </p>
              <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Subject
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Top 3
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" /> Other Comps
                </span>
              </div>
            </div>
          </div>

          <div className="divide-y-0">
            {allCompsSorted.map((comp) => (
              <CompRow
                key={comp.address}
                comp={comp}
                isTopThree={bestThreeAddresses.has(comp.address)}
                subjectSqft={analysis.subjectSqft}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
