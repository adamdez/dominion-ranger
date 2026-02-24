'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Phone, PhoneCall, SkipForward, SearchCheck, Zap,
  AlertCircle, Wifi, WifiOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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

  useEffect(() => {
    if (twilioAvailable && !twilio.deviceReady) {
      twilio.initDevice();
    }
  }, [twilioAvailable, twilio.deviceReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (twilio.callState === 'ended') {
      setIsDialing(false); // eslint-disable-line react-hooks/set-state-in-effect -- external subscription pattern
      refetch();
    }
  }, [twilio.callState, refetch]);

  const handleStartCall = useCallback(() => {
    if (!currentLead) return;

    if (twilioAvailable && twilio.deviceReady && currentLead.phone) {
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
      <div className="text-[13px] text-muted-foreground py-8 text-center">Loading...</div>
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

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
      {/* Left: Current Lead */}
      <div className="space-y-3">
        {/* Twilio status */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {twilioAvailable && twilio.deviceReady ? (
            <><Wifi className="h-3 w-3 text-emerald-400" /> Browser dialer active</>
          ) : twilioAvailable ? (
            <><Wifi className="h-3 w-3 text-amber-400" /> Connecting...</>
          ) : (
            <><WifiOff className="h-3 w-3" /> Manual dial mode</>
          )}
          {twilio.error && (
            <span className="text-rose-400 ml-2">{twilio.error}</span>
          )}
        </div>

        {currentLead && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {currentLead.streetAddress ?? 'Unknown Address'}
                </CardTitle>
                <StatusBadge status={isDialing ? 'DIALING' : currentLead.status} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                {currentLead.ownerName ?? 'Unknown'} · {currentLead.county ?? '—'}, {currentLead.city ?? '—'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-border rounded-md p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Composite</p>
                  <ScoreBadge score={currentLead.compositeScore} size="lg" />
                </div>
                <div className="border border-border rounded-md p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Motivation</p>
                  <ScoreBadge score={currentLead.motivationScore} size="md" />
                </div>
                <div className="border border-border rounded-md p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Deal</p>
                  <ScoreBadge score={currentLead.dealScore} size="md" />
                </div>
              </div>

              {currentLead.phone ? (
                <div className="flex items-center gap-2 border border-border rounded-md p-2.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-base font-semibold text-foreground">{currentLead.phone}</span>
                </div>
              ) : (
                <div className="border border-amber-800/50 rounded-md p-2.5 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-[13px] font-medium">No phone — run skip trace</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="ghost"
                      className="border border-border"
                      disabled={skipTrace.isPending}
                      onClick={() => skipTrace.mutate({
                        dominionLeadId: currentLead.dominionLeadId,
                        tier: 'STANDARD',
                      })}
                    >
                      <SearchCheck className="mr-1 h-3 w-3" />
                      {skipTrace.isPending ? '...' : 'Standard ($0.10)'}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="border border-border"
                      disabled={skipTrace.isPending}
                      onClick={() => skipTrace.mutate({
                        dominionLeadId: currentLead.dominionLeadId,
                        tier: 'ADVANCED',
                      })}
                    >
                      <Zap className="mr-1 h-3 w-3" />
                      Advanced ($0.40)
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-border/50" />

              {!isDialing ? (
                <Button className="w-full" size="default" onClick={handleStartCall} disabled={!currentLead.phone}>
                  {twilioAvailable && twilio.deviceReady ? (
                    <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Phone className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {twilioAvailable && twilio.deviceReady ? 'Call via Browser' : 'Start Call'}
                </Button>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 border border-emerald-800/50 rounded-md px-2.5 py-1.5 text-emerald-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-[13px] font-medium">
                      {twilio.callState === 'connected'
                        ? `Connected — ${Math.floor(twilio.callDuration / 60)}:${(twilio.callDuration % 60).toString().padStart(2, '0')}`
                        : twilio.callState === 'ringing'
                          ? 'Ringing...'
                          : 'Call in progress'}
                    </span>
                  </div>

                  <Select value={disposition} onValueChange={setDisposition}>
                    <SelectTrigger className="h-8 text-[13px]">
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
                    rows={2}
                    className="text-[13px]"
                  />

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      size="sm"
                      disabled={!disposition || logDisposition.isPending}
                      onClick={() => handleSubmitDisposition(true)}
                    >
                      <SkipForward className="mr-1 h-3.5 w-3.5" />
                      Submit & Next
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border border-border"
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
                  <div className="border-t border-border/50" />
                  <div>
                    <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Recent Dispositions</h4>
                    <div className="space-y-0">
                      {(dispositionHistory.data ?? []).slice(0, 5).map((d) => (
                        <div key={d.id} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0 text-[12px]">
                          <span className="font-medium text-foreground">{DISPOSITION_TYPES[d.disposition as keyof typeof DISPOSITION_TYPES]?.label ?? d.disposition}</span>
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
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Queue</CardTitle>
            <span className="text-[11px] font-mono text-muted-foreground">
              {data?.pagination.total ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-0 px-3 pb-3">
              {leads.map((lead, idx) => (
                <button
                  key={lead.leadInstanceId}
                  className={`w-full px-2 py-1.5 text-left transition-colors rounded-md ${
                    idx === currentIndex
                      ? 'bg-white/5 border-l-2 border-emerald-500 pl-[6px]'
                      : 'hover:bg-white/[0.02] border-l-2 border-transparent pl-[6px]'
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
                    <span className="text-[13px] font-medium text-foreground truncate max-w-[140px]">
                      {lead.streetAddress ?? 'Unknown'}
                    </span>
                    <ScoreBadge score={lead.compositeScore} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {lead.ownerName ?? '—'}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
