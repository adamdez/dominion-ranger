'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Phone,
  MessageSquare,
  SkipForward,
  SearchCheck,
  Zap,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ScoreHoverCard } from '@/components/scoring/score-breakdown-tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDialQueue, useLogDisposition } from '@/hooks/use-dial-queue';
import { useTransitionLead } from '@/hooks/use-leads';
import { useSkipTrace } from '@/hooks/use-skip-trace';
import { useResolveContacts } from '@/hooks/use-contact-resolver';
import { useDialerStatus } from '@/hooks/use-dialer';
import { useTwilioContext } from '@/components/dialer/twilio-provider';
import {
  usePropertyDetail,
  usePropertyEvents,
  useLeadHistory,
} from '@/hooks/use-property-detail';
import { DISPOSITION_TYPES } from '@/lib/constants';
import { EVENT_LABELS } from '@/components/scoring/score-breakdown-tooltip';
import { format, formatDistanceToNow } from 'date-fns';

const DISPOSITION_BUTTONS = [
  'NO_ANSWER',
  'LEFT_VOICEMAIL',
  'CALLBACK_REQUESTED',
  'INTERESTED',
  'NOT_INTERESTED',
  'DO_NOT_CALL',
  'WRONG_NUMBER',
  'DISCONNECTED',
] as const;

const CONNECT_DISPOSITIONS = new Set(['LEFT_VOICEMAIL', 'CALLBACK_REQUESTED', 'INTERESTED', 'APPOINTMENT_SET', 'NOT_INTERESTED', 'DO_NOT_CALL']);
const CONV_DISPOSITIONS = new Set(['INTERESTED', 'APPOINTMENT_SET']);

export default function DialQueuePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedDisposition, setSelectedDisposition] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [callbackDate, setCallbackDate] = useState<string>('');
  const [isDialing, setIsDialing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [sessionDials, setSessionDials] = useState(0);
  const [sessionConnects, setSessionConnects] = useState(0);
  const [sessionConv, setSessionConv] = useState(0);

  const { data, isLoading, error, refetch } = useDialQueue(1, 50);
  const logDisposition = useLogDisposition();
  const transitionLead = useTransitionLead();
  const skipTrace = useSkipTrace();
  const resolveContacts = useResolveContacts();
  const dialerStatus = useDialerStatus();
  const twilio = useTwilioContext();

  const twilioAvailable = dialerStatus.data?.clientConfigured ?? false;
  const leads = data?.data ?? [];
  const currentLead = leads[currentIndex] ?? null;

  const propertyDetail = usePropertyDetail(currentLead?.dominionLeadId ?? null);
  const events = usePropertyEvents(currentLead?.dominionLeadId ?? null);
  const history = useLeadHistory(currentLead?.leadInstanceId ?? null);

  const showCallbackPicker = selectedDisposition === 'CALLBACK_REQUESTED' || selectedDisposition === 'INTERESTED';

  useEffect(() => {
    if (twilioAvailable && !twilio.deviceReady) {
      twilio.initDevice();
    }
  }, [twilioAvailable, twilio.deviceReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync call end to local state */
    if (twilio.callState === 'ended') {
      setIsDialing(false);
      refetch();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [twilio.callState, refetch]);

  const handleStartSession = useCallback(() => {
    setSessionActive(true);
    setSessionStart(new Date());
    setSessionDials(0);
    setSessionConnects(0);
    setSessionConv(0);
  }, []);

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
      if (!currentLead || !selectedDisposition) return;

      const dispConfig = DISPOSITION_TYPES[selectedDisposition as keyof typeof DISPOSITION_TYPES];
      const cbDate = showCallbackPicker && callbackDate ? new Date(callbackDate).toISOString() : undefined;

      logDisposition.mutate(
        {
          leadInstanceId: currentLead.leadInstanceId,
          disposition: selectedDisposition,
          notes: notes || undefined,
          callbackDate: cbDate,
        },
        {
          onSuccess: () => {
            setSessionDials((d) => d + 1);
            if (CONNECT_DISPOSITIONS.has(selectedDisposition)) setSessionConnects((c) => c + 1);
            if (CONV_DISPOSITIONS.has(selectedDisposition)) setSessionConv((c) => c + 1);

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

            setSelectedDisposition('');
            setNotes('');
            setCallbackDate('');
            setIsDialing(false);

            if (advance && currentIndex < leads.length - 1) {
              setCurrentIndex((i) => i + 1);
            }
            refetch();
          },
        },
      );
    },
    [currentLead, selectedDisposition, notes, callbackDate, showCallbackPicker, logDisposition, transitionLead, currentIndex, leads.length, refetch],
  );

  const [sessionElapsed, setSessionElapsed] = useState(0);
  useEffect(() => {
    if (!sessionStart) return;
    const tick = () => setSessionElapsed(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStart]);
  const sessionTimeStr = `${String(Math.floor(sessionElapsed / 3600)).padStart(2, '0')}:${String(Math.floor((sessionElapsed % 3600) / 60)).padStart(2, '0')}:${String(sessionElapsed % 60).padStart(2, '0')}`;

  if (error) {
    return <ErrorState message="Failed to load dial queue" onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
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

  const property = propertyDetail.data;
  const distressEvents = events.data ?? [];
  const timeline = history.data ?? [];
  const topSignal = (currentLead?.topSignals as string[] | undefined)?.[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Session Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-4">
          {!sessionActive ? (
            <Button size="sm" onClick={handleStartSession}>
              Start Session
            </Button>
          ) : (
            <span className="text-sm font-medium">Session active</span>
          )}
          <span className="text-sm text-muted-foreground">
            Dials: <span className="font-mono font-medium">{sessionDials}</span>
            {' · '}
            Connects: <span className="font-mono font-medium">{sessionConnects}</span>
            {' · '}
            Conv: <span className="font-mono font-medium">{sessionConv}</span>
          </span>
          {sessionStart && (
            <span className="text-xs text-muted-foreground">Session time: {sessionTimeStr}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {twilioAvailable && twilio.deviceReady ? (
            <><Wifi className="h-3.5 w-3.5 text-emerald-500" /> Browser dialer active</>
          ) : twilioAvailable ? (
            <><Wifi className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Dialer connecting...</>
          ) : (
            <><WifiOff className="h-3.5 w-3.5" /> Manual dial mode</>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] min-h-0">
        {/* Left: Queue List */}
        <Card className="lg:w-[320px] shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Queue</CardTitle>
            <p className="text-xs text-muted-foreground">Sorted by score desc.</p>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-0.5 px-3 pb-4">
                {leads.map((lead, idx) => (
                  <button
                    key={lead.leadInstanceId}
                    className={`w-full rounded-md px-3 py-2.5 text-left transition-colors border-l-2 ${
                      idx === currentIndex
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      if (!isDialing || idx === currentIndex) {
                        setCurrentIndex(idx);
                        setIsDialing(false);
                        setSelectedDisposition('');
                        setNotes('');
                        setCallbackDate('');
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate flex-1">
                        {lead.ownerName ?? 'Unknown'}
                      </span>
                      <ScoreHoverCard score={lead.compositeScore} dominionLeadId={lead.dominionLeadId}>
                        <ScoreBadge score={lead.compositeScore} />
                      </ScoreHoverCard>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {lead.phone ? (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {lead.phone.length === 10
                            ? `(${lead.phone.slice(0,3)}) ${lead.phone.slice(3,6)}-${lead.phone.slice(6)}`
                            : lead.phone}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-500 font-medium">No phone</span>
                      )}
                      {(lead.topSignals as string[] | undefined)?.[0] && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {EVENT_LABELS[(lead.topSignals as string[])[0]]?.label ?? (lead.topSignals as string[])[0]}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Active Lead Panel */}
        <div className="flex flex-col min-w-0">
          {currentLead && (
            <Card className="flex-1 flex flex-col min-h-0">
              <CardContent className="flex flex-col gap-4 p-4 overflow-y-auto">
                {/* Contact Info */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact Info</h4>
                  <p className="text-sm font-medium">{currentLead.ownerName ?? 'Unknown'}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {currentLead.phone && (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{currentLead.phone}</span>
                        <Button size="sm" variant="outline" onClick={handleStartCall} disabled={!twilioAvailable || isDialing}>
                          <Phone className="h-3.5 w-3.5 mr-1" /> Dial
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={`sms:${currentLead.phone}`}>
                            <MessageSquare className="h-3.5 w-3.5 mr-1" /> SMS
                          </a>
                        </Button>
                      </div>
                    )}
                    {currentLead.phone2 && <span className="text-xs text-muted-foreground">Alt: {currentLead.phone2}</span>}
                    {currentLead.email && <span className="text-xs">Email: {currentLead.email}</span>}
                  </div>
                  {!currentLead.phone && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 mt-2 flex gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">No phone — run skip trace</p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm" variant="outline"
                            disabled={resolveContacts.isPending || skipTrace.isPending}
                            onClick={() => resolveContacts.mutate({ dominionLeadId: currentLead.dominionLeadId, tier: 'basic' })}
                          >
                            <SearchCheck className="mr-1 h-3 w-3" /> BatchData ($0.01)
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            disabled={resolveContacts.isPending || skipTrace.isPending}
                            onClick={() => resolveContacts.mutate({ dominionLeadId: currentLead.dominionLeadId, tier: 'deep' })}
                          >
                            <Zap className="mr-1 h-3 w-3" /> Deep Trace
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Property Summary */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Property Summary</h4>
                  <p className="text-sm font-medium">{currentLead.streetAddress ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {property?.apn ? `APN: ${property.apn} · ` : ''}
                    {currentLead.county ?? '—'}{currentLead.city ? `, ${currentLead.city}` : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div><span className="text-muted-foreground">Est. value:</span> {property?.equityEstimate ? `$${Number(property.equityEstimate).toLocaleString()}` : '—'}</div>
                    <div><span className="text-muted-foreground">Equity:</span> {property?.equityEstimate ?? '—'}</div>
                    <div><span className="text-muted-foreground">Score:</span> <ScoreHoverCard score={currentLead.compositeScore} dominionLeadId={currentLead.dominionLeadId}><ScoreBadge score={currentLead.compositeScore} /></ScoreHoverCard></div>
                    <div><span className="text-muted-foreground">Signals:</span> {topSignal ? (EVENT_LABELS[topSignal]?.label ?? topSignal) : '—'}</div>
                  </div>
                </div>

                <Separator />

                {/* Signals & History */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Signals & History</h4>
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2">
                      {distressEvents.slice(0, 5).map((ev: { eventType: string; occurredAt?: string }) => (
                        <div key={ev.eventType + (ev.occurredAt ?? '')} className="text-xs flex justify-between">
                          <span>{EVENT_LABELS[ev.eventType]?.label ?? ev.eventType}</span>
                          <span className="text-muted-foreground">{ev.occurredAt ? format(new Date(ev.occurredAt), 'MMM d') : ''}</span>
                        </div>
                      ))}
                      {timeline.slice(0, 10).map((item: { type: string; summary: string; timestamp: string }, i: number) => (
                        <div key={i} className="text-xs flex justify-between">
                          <span>{item.summary}</span>
                          <span className="text-muted-foreground">{format(new Date(item.timestamp), 'MMM d, h:mm')}</span>
                        </div>
                      ))}
                      {distressEvents.length === 0 && timeline.length === 0 && (
                        <p className="text-xs text-muted-foreground">No signals or history</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <Separator />

                {/* Quick Disposition */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick Disposition</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {DISPOSITION_BUTTONS.map((key) => (
                      <Button
                        key={key}
                        size="sm"
                        variant={selectedDisposition === key ? 'default' : 'outline'}
                        className={selectedDisposition === key ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                        onClick={() => setSelectedDisposition(key)}
                      >
                        {DISPOSITION_TYPES[key as keyof typeof DISPOSITION_TYPES]?.label ?? key}
                      </Button>
                    ))}
                  </div>
                  {showCallbackPicker && (
                    <div className="mt-3">
                      <label className="text-xs text-muted-foreground">Callback date</label>
                      <input
                        type="datetime-local"
                        value={callbackDate}
                        onChange={(e) => setCallbackDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  <div className="mt-3">
                    <Textarea placeholder="Notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
                  </div>
                  <Button
                    className="mt-3 w-full"
                    disabled={!selectedDisposition || logDisposition.isPending}
                    onClick={() => handleSubmitDisposition(true)}
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Save & Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
