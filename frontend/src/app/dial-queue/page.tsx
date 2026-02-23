'use client';

import { useState, useCallback } from 'react';
import { Phone, SkipForward, PhoneOff } from 'lucide-react';
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
import { DISPOSITION_TYPES } from '@/lib/constants';

export default function DialQueuePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');
  const [isDialing, setIsDialing] = useState(false);

  const { data, isLoading, error, refetch } = useDialQueue(1, 50);
  const logDisposition = useLogDisposition();
  const transitionLead = useTransitionLead();

  const leads = data?.data ?? [];
  const currentLead = leads[currentIndex] ?? null;
  const dispositionHistory = useDispositions(currentLead?.leadInstanceId ?? null);

  const handleStartCall = useCallback(() => {
    if (!currentLead) return;
    transitionLead.mutate(
      {
        leadInstanceId: currentLead.leadInstanceId,
        toStatus: 'DIALING',
        expectedVersion: currentLead.version,
      },
      {
        onSuccess: () => setIsDialing(true),
        onError: () => setIsDialing(false),
      }
    );
  }, [currentLead, transitionLead]);

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

            if (advance) {
              refetch().then(() => {
                if (currentIndex < leads.length - 1) {
                  setCurrentIndex(i => i + 1);
                } else {
                  setCurrentIndex(0);
                }
              });
            }
          },
        }
      );
    },
    [currentLead, disposition, notes, logDisposition, transitionLead, currentIndex, leads.length, refetch]
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
        description="Assign leads and run compliance first. Leads must be DIAL_READY to appear here."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Left: Current Lead */}
      <div className="space-y-4">
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

              {currentLead.phone && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-lg font-semibold">{currentLead.phone}</span>
                </div>
              )}

              {!currentLead.phone && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                  <PhoneOff className="h-4 w-4" />
                  <span className="text-sm font-medium">No phone number on file</span>
                </div>
              )}

              <Separator />

              {!isDialing ? (
                <Button className="w-full" size="lg" onClick={handleStartCall} disabled={transitionLead.isPending}>
                  <Phone className="mr-2 h-4 w-4" />
                  Start Call
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-sm font-medium">Call in progress</span>
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
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
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
  );
}
