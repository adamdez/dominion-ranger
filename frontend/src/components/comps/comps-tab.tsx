'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RefreshCw, FileText, ArrowUpDown } from 'lucide-react';
import { usePropertyCompReports, useGenerateCompReport } from '@/hooks/use-comps';
import type { CompReport, CompEntry } from '@/hooks/use-comps';
import { format } from 'date-fns';

interface CompsTabProps {
  dominionLeadId: string;
}

type SortField = 'distanceMiles' | 'salePriceCents' | 'saleDate' | 'sqft';
type SortDir = 'asc' | 'desc';

function centsToUsd(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '\u2014';
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function centsToUsdPer(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '\u2014';
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function CompsTab({ dominionLeadId }: CompsTabProps) {
  const reportsQuery = usePropertyCompReports(dominionLeadId);
  const generateMutation = useGenerateCompReport();

  const report: CompReport | null = reportsQuery.data?.[0] ?? null;

  const [rehabInput, setRehabInput] = useState('');
  const [feeInput, setFeeInput] = useState('');
  const [sortField, setSortField] = useState<SortField>('distanceMiles');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const rehabCents = useMemo(() => {
    const val = parseFloat(rehabInput);
    return isNaN(val) ? (report?.rehabEstimateCents ?? 0) : Math.round(val * 100);
  }, [rehabInput, report?.rehabEstimateCents]);

  const feeCents = useMemo(() => {
    const val = parseFloat(feeInput);
    return isNaN(val) ? (report?.assignmentFeeCents ?? 500000) : Math.round(val * 100);
  }, [feeInput, report?.assignmentFeeCents]);

  const arvCents = report?.arvCents ?? 0;
  const liveMaxOffer = useMemo(() => {
    if (arvCents <= 0) return 0;
    return Math.round(arvCents * 0.7) - rehabCents - feeCents;
  }, [arvCents, rehabCents, feeCents]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortDir(field === 'salePriceCents' ? 'desc' : 'asc');
      return field;
    });
  }, []);

  const sortedComps = useMemo(() => {
    const comps = (report?.comps ?? []) as CompEntry[];
    return [...comps].sort((a, b) => {
      let aVal: number;
      let bVal: number;
      if (sortField === 'saleDate') {
        aVal = new Date(a.saleDate).getTime();
        bVal = new Date(b.saleDate).getTime();
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [report?.comps, sortField, sortDir]);

  const handlePullComps = () => {
    generateMutation.mutate({ dominionLeadId, forceFresh: false });
  };

  const handleFreshComps = () => {
    generateMutation.mutate({ dominionLeadId, forceFresh: true });
  };

  if (reportsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <p className="text-sm text-muted-foreground">No comparable sales data yet.</p>
        <Button onClick={handlePullComps} disabled={generateMutation.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
          {generateMutation.isPending ? 'Pulling Comps...' : 'Pull Comps'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <ValuationRow label="Estimated Value" value={centsToUsd(report.estimatedValueCents)} bold />
          <ValuationRow
            label="Confidence"
            value={report.confidenceScore ? `${parseFloat(report.confidenceScore).toFixed(0)}%` : '\u2014'}
          />
          <ValuationRow
            label="Range"
            value={
              report.estimatedValueLowCents && report.estimatedValueHighCents
                ? `${centsToUsd(report.estimatedValueLowCents)} \u2013 ${centsToUsd(report.estimatedValueHighCents)}`
                : '\u2014'
            }
          />
          <ValuationRow label="Comps Found" value={String(report.compCount)} />
          <ValuationRow label="Avg $/sqft" value={centsToUsdPer(report.avgPricePerSqftCents)} />
          <ValuationRow label="Median Sale" value={centsToUsd(report.medianSalePriceCents)} />
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">WHOLESALE CALCULATOR</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ARV</span>
              <span className="font-medium">{centsToUsd(arvCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{'\u00d7'} 70%</span>
              <span className="font-medium">{centsToUsd(arvCents > 0 ? Math.round(arvCents * 0.7) : 0)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Rehab Estimate ($)</label>
              <Input
                type="number"
                placeholder={(rehabCents / 100).toString()}
                value={rehabInput}
                onChange={(e) => setRehabInput(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Assignment Fee ($)</label>
              <Input
                type="number"
                placeholder={(feeCents / 100).toString()}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/50 p-3">
            <span className="text-sm font-semibold">Max Offer</span>
            <span className={`text-lg font-bold ${liveMaxOffer > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {liveMaxOffer > 0 ? centsToUsd(liveMaxOffer) : '\u2014'}
            </span>
          </div>
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleFreshComps} disabled={generateMutation.isPending}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? 'Pulling...' : 'Pull Fresh Comps'}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" variant="outline" disabled>
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    Generate PDF
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {report.createdAt && (
          <p className="text-xs text-muted-foreground">
            Last pulled: {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
            {report.generatedBy ? ` by ${report.generatedBy}` : ''}
          </p>
        )}
      </div>

      {sortedComps.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            COMPARABLE SALES ({sortedComps.length})
          </h4>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Address</th>
                    <SortableHeader field="saleDate" label="Sale Date" current={sortField} dir={sortDir} onToggle={toggleSort} />
                    <SortableHeader field="salePriceCents" label="Price" current={sortField} dir={sortDir} onToggle={toggleSort} />
                    <th className="text-right px-3 py-2 font-medium">Beds</th>
                    <th className="text-right px-3 py-2 font-medium">Baths</th>
                    <SortableHeader field="sqft" label="Sqft" current={sortField} dir={sortDir} onToggle={toggleSort} />
                    <th className="text-right px-3 py-2 font-medium">$/Sqft</th>
                    <SortableHeader field="distanceMiles" label="Distance" current={sortField} dir={sortDir} onToggle={toggleSort} />
                    <th className="text-right px-3 py-2 font-medium">DOM</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedComps.map((comp, i) => (
                    <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-2 max-w-[180px] truncate" title={comp.address}>
                        {comp.address}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {comp.saleDate ? format(new Date(comp.saleDate), 'MM/dd/yy') : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {centsToUsd(comp.salePriceCents)}
                      </td>
                      <td className="px-3 py-2 text-right">{comp.beds || '\u2014'}</td>
                      <td className="px-3 py-2 text-right">{comp.baths || '\u2014'}</td>
                      <td className="px-3 py-2 text-right">
                        {comp.sqft ? comp.sqft.toLocaleString() : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {centsToUsdPer(comp.pricePerSqftCents)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {comp.distanceMiles ? `${comp.distanceMiles.toFixed(1)} mi` : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {comp.daysOnMarket ?? '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ValuationRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? 'font-semibold text-base' : 'font-medium'}>{value}</span>
    </div>
  );
}

function SortableHeader({
  field,
  label,
  current,
  dir,
  onToggle,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onToggle: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th className="text-right px-3 py-2 font-medium">
      <button
        className="inline-flex items-center gap-0.5 hover:text-foreground"
        onClick={() => onToggle(field)}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? 'text-foreground' : 'text-muted-foreground/50'}`} />
        {active && <span className="text-[9px]">{dir === 'asc' ? '\u2191' : '\u2193'}</span>}
      </button>
    </th>
  );
}
