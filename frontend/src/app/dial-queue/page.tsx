'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Phone,
  PhoneCall,
  SkipForward,
  SearchCheck,
  Zap,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ExportCsvButton } from '@/components/ui/export-csv-button';
import { getScoreTier } from '@/lib/constants';
import type { CsvColumn } from '@/lib/csv-export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDialQueue, useLogDisposition, useDispositions } from '@/hooks/use-dial-queue';
import { useTransitionLead } from '@/hooks/use-leads';
import { useSkipTrace } from '@/hooks/use-skip-trace';
import { useDialerStatus } from '@/hooks/use-dialer';
import { useTwilioContext } from '@/components/dialer/twilio-provider';
import { DISPOSITION_TYPES } from '@/lib/constants';
import type { LeadWithProperty } from '@/lib/types';

export default function DialQueuePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');
  const [isDialing, setIsDialing] = useState(false);

  const { data, isLoading, error, refetch } = useDialQueue(1, 50);
  const logDisposition = useLogDisposition();
  const transitionLead = useTransitionLead();
  const skipTrace = useSkipTrace();
  const dialerStatus = useDialerStatus();
  const twilio = useTwilioContext();

  const twilioAvailable = dialerStatus.data?.clientConfigured ?? false;

  const leads = data?.data ?? [];
  const currentLead = leads[currentIndex] ?? null;
  const dispositionHistory = useDispositions(currentLead?.leadInstanceId ?? null);

  // Initialize Twilio device when page loads if configured
  useEffect(() => {
    if (twilioAvailable && !twilio.deviceReady) {
      twilio.initDevice();
    }
  }, [twilioAvailable, twilio.deviceReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for call state changes from softphone widget
  useEffect(() => {
    if (twilio.callState === 'ended') {
      setIsDialing(false);
      refetch();
    }
  }, [twilio.callState, refetch]);

  const handleStartCall = useCallback(() => {
    if (!currentLead) return;

    if (twilioAvailable && twilio.deviceReady && currentLead.phone) {
      // Browser-based Twilio call
      twilio.startCall({
        dominionLeadId: currentLead.dominionLeadId,
        leadInstanceId: currentLead.leadInstanceId,
        leadName: currentLead.ownerName ?? 'Unknown',
        phone: currentLead.phone,
        version: currentLead.version,
      });
    }

    transitionLead.mutate({
      leadInstanceId: currentLead.leadInstanceId,
      toStatus: 'DIALING',
      expectedVersion: currentLead.version,
    });
    setIsDialing(true);
  }, [currentLead, transitionLead, twilioAvailable, twilio]);

  const handleSubmitDisposition = useCallback(
    (advance: boolean) => {
      if (!currentLead || !disposition) return;

      const dispConfig = DISPOSITION_TYPES[disposition as keyof typeof DISPOSITION_TYPES];

      logDisposition.mutate(
        {
          leadInstanceId: currentLead.leadInstanceId,
          disposition,
          notes: notes || undefined,
        },
        {
          onSuccess: () => {
            if (dispConfig?.action === 'dead' || dispConfig?.action === 'dnc') {
              transitionLead.mutate({
                leadInstanceId: currentLead.leadInstanceId,
                toStatus: 'DEAD',
                expectedVersion: currentLead.version + 1,
              });
            } else if (dispConfig?.action === 'contacted') {
              transitionLead.mutate({
                leadInstanceId: currentLead.leadInstanceId,
                toStatus: 'CONTACTED',
                expectedVersion: currentLead.version + 1,
              });
            }

            setDisposition('');
            setNotes('');
            setIsDialing(false);

            if (advance && currentIndex < leads.length - 1) {
              setCurrentIndex((i) => i + 1);
            }

            refetch();
          },
        },
      );
    },
    [currentLead, disposition, notes, logDisposition, transitionLead, currentIndex, leads.length, refetch],
  );

  if (error) {
    return <ErrorState message="Failed to load dial queue" onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Phone}
        title="No leads in dial queue"
        description="Import properties, run scoring, and promote leads to populate the dial queue."
      />
    );
  }

  const dialQueueExportColumns: CsvColumn<LeadWithProperty>[] = [
    { key: 'streetAddress', header: 'Address' },
    { key: 'ownerName', header: 'Owner' },
    { key: 'phone', header: 'Phone' },
    { key: 'compositeScore', header: 'Score' },
    { key: (r) => getScoreTier(r.compositeScore ?? 0), header: 'Tier' },
    { key: 'assignedTo', header: 'Assigned To' },
    { key: (r) => (r.updatedAt ? new Date(r.updatedAt).toISOString().split('T')[0] : ''), header: 'Last Updated' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportCsvButton
          data={leads}
          columns={dialQueueExportColumns}
          filename="dominion-dial-queue"
          totalCount={data?.pagination.total}
          exportUrl={data && data.pagination.total > leads.length ? '/api/dial-queue/export' : undefined}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Left: Current Lead */}
      <div className="space-y-4">
        {/* Twilio status indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {twilioAvailable && twilio.deviceReady ? (
            <><Wifi className="h-3.5 w-3.5 text-emerald-500" /> Browser dialer active</>
          ) : twilioAvailable ? (
            <><Wifi className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Dialer connecting...</>
          ) : (
            <><WifiOff className="h-3.5 w-3.5" /> Manual dial mode (Twilio not configured)</>
          )}
          {twilio.error && (
            <span className="text-red-500 ml-2">{twilio.error}</span>
          )}
        </div>

        {currentLead && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">
                  {currentLead.streetAddress ?? 'Unknown Address'}
                </CardTitle>
                <StatusBadge status={isDialing ? 'DIALING' : currentLead.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {currentLead.ownerName ?? 'Unknown'} • {currentLead.county ?? '—'}, {currentLead.city ?? '—'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Composite</p>
                  <ScoreBadge score={currentLead.compositeScore} size="lg" />
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Motivation</p>
                  <ScoreBadge score={currentLead.motivationScore} size="md" />
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Deal</p>
                  <ScoreBadge score={currentLead.dealScore} size="md" />
                </div>
              </div>

              {currentLead.phone ? (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-lg font-semibold">{currentLead.phone}</span>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">No phone number — run skip trace</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={skipTrace.isPending}
                      onClick={() => skipTrace.mutate({
                        dominionLeadId: currentLead.dominionLeadId,
                        tier: 'STANDARD',
                      })}
                    >
                      <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
                      {skipTrace.isPending ? 'Tracing...' : 'Standard ($0.10)'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={skipTrace.isPending}
                      onClick={() => skipTrace.mutate({
                        dominionLeadId: currentLead.dominionLeadId,
                        tier: 'ADVANCED',
                      })}
                    >
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                      Advanced ($0.40)
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              {!isDialing ? (
                <Button className="w-full" size="lg" onClick={handleStartCall} disabled={!currentLead.phone}>
                  {twilioAvailable && twilio.deviceReady ? (
                    <PhoneCall className="mr-2 h-4 w-4" />
                  ) : (
                    <Phone className="mr-2 h-4 w-4" />
                  )}
                  {twilioAvailable && twilio.deviceReady ? 'Call via Browser' : 'Start Call'}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-sm font-medium">
                      {twilio.callState === 'connected'
                        ? `Connected — ${Math.floor(twilio.callDuration / 60)}:${(twilio.callDuration % 60).toString().padStart(2, '0')}`
                        : twilio.callState === 'ringing'
                          ? 'Ringing...'
                          : 'Call in progress'}
                    </span>
                  </div>

                  <Select value={disposition} onValueChange={setDisposition}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select disposition..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DISPOSITION_TYPES).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Textarea
                    placeholder="Notes (optional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={!disposition || logDisposition.isPending}
                      onClick={() => handleSubmitDisposition(true)}
                    >
                      <SkipForward className="mr-1.5 h-4 w-4" />
                      Submit & Next
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!disposition || logDisposition.isPending}
                      onClick={() => handleSubmitDisposition(false)}
                    >
                      Submit & Stay
                    </Button>
                  </div>
                </div>
              )}

              {/* Disposition History */}
              {(dispositionHistory.data ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Recent Dispositions</h4>
                    <div className="space-y-1">
                      {(dispositionHistory.data ?? []).slice(0, 5).map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{DISPOSITION_TYPES[d.disposition as keyof typeof DISPOSITION_TYPES]?.label ?? d.disposition}</span>
                          <span className="text-muted-foreground">{d.notes ? `"${d.notes.slice(0, 30)}"` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: Queue Preview */}
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Queue</span>
            <span className="text-sm font-normal text-muted-foreground">
              {data?.pagination.total ?? 0} leads
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="space-y-0.5 px-4 pb-4">
              {leads.map((lead, idx) => (
                <button
                  key={lead.leadInstanceId}
                  className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                    idx === currentIndex
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => {
                    if (!isDialing || idx === currentIndex) {
                      setCurrentIndex(idx);
                      setIsDialing(false);
                      setDisposition('');
                      setNotes('');
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate max-w-[180px]">
                      {lead.streetAddress ?? 'Unknown'}
                    </span>
                    <ScoreBadge score={lead.compositeScore} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.ownerName ?? '—'}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
