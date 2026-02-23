'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useClaimLead,
  useTransitionLead,
  useRunCompliance,
  useLeadAudit,
} from '@/hooks/use-leads';
import type { LeadWithProperty, AuditLogEntry } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import {
  UserPlus,
  Shield,
  Phone,
  MessageSquare,
  Send,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  StickyNote,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface LeadDetailSheetProps {
  lead: LeadWithProperty | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDetailSheet({ lead, open, onClose }: LeadDetailSheetProps) {
  const claimMutation = useClaimLead();
  const transitionMutation = useTransitionLead();
  const complianceMutation = useRunCompliance();
  const auditQuery = useLeadAudit(lead?.dominionLeadId ?? null);
  const [noteText, setNoteText] = useState('');

  if (!lead) return null;

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    transitionMutation.mutate({
      leadInstanceId: lead.leadInstanceId,
      toStatus: lead.status,
      expectedVersion: lead.version,
      notes: noteText.trim(),
    }, {
      onSuccess: () => setNoteText(''),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-lg">
            {lead.streetAddress ?? 'Unknown Address'}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {lead.ownerName ?? 'Unknown Owner'} • {lead.county ?? '—'}{lead.city ? `, ${lead.city}` : ''}
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* Score Section with Visual Bars */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">SCORING</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <ScoreCard label="Composite" score={lead.compositeScore} />
                <ScoreCard label="Motivation" score={lead.motivationScore} />
                <ScoreCard label="Deal" score={lead.dealScore} />
              </div>
              <div className="space-y-2">
                <ScoreBar label="Motivation" score={lead.motivationScore} />
                <ScoreBar label="Deal" score={lead.dealScore} />
                {lead.confidenceScore !== null && lead.confidenceScore !== undefined && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Confidence</span>
                      <span>{Math.round(lead.confidenceScore * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.round(lead.confidenceScore * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Status Section */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">STATUS</h3>
              <div className="flex items-center justify-between">
                <StatusBadge status={lead.status} />
                <ComplianceIndicator lead={lead} />
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                v{lead.version} • Updated {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
              </div>
            </section>

            {/* Action Buttons */}
            <section className="flex flex-wrap gap-2">
              <StatusActions
                lead={lead}
                onClaim={() => claimMutation.mutate({
                  leadInstanceId: lead.leadInstanceId,
                  expectedVersion: lead.version,
                })}
                onCompliance={() => complianceMutation.mutate(lead.leadInstanceId)}
                onTransition={(toStatus) => transitionMutation.mutate({
                  leadInstanceId: lead.leadInstanceId,
                  toStatus,
                  expectedVersion: lead.version,
                })}
                loading={claimMutation.isPending || transitionMutation.isPending || complianceMutation.isPending}
              />
            </section>

            <Separator />

            {/* Contact Info */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">CONTACT</h3>
              <div className="space-y-1 text-sm">
                <InfoRow label="Phone" value={lead.phone} />
                <InfoRow label="Assigned To" value={lead.assignedTo} />
                <InfoRow label="Events" value={String(lead.eventCount ?? 0)} />
              </div>
            </section>

            <Separator />

            {/* Notes Section */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" />
                NOTES
              </h3>
              {lead.notes && (
                <div className="rounded-md border bg-muted/50 p-3 text-sm mb-3 whitespace-pre-wrap">
                  {lead.notes}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  disabled={!noteText.trim() || transitionMutation.isPending}
                  onClick={handleAddNote}
                  className="self-end"
                >
                  Add
                </Button>
              </div>
            </section>

            <Separator />

            {/* Status History Timeline */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">HISTORY</h3>
              {auditQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (auditQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No history available</p>
              ) : (
                <div className="relative pl-4 border-l-2 border-muted space-y-3">
                  {(auditQuery.data ?? []).slice(0, 20).map((entry: AuditLogEntry) => (
                    <div key={entry.logId} className="relative">
                      <span className="absolute -left-[calc(0.25rem+1px)] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <div className="ml-2">
                        <span className="text-xs font-medium">{entry.actionType}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {format(new Date(entry.createdAt), 'MMM d, h:mm a')}
                        </span>
                        {entry.userId && (
                          <span className="text-xs text-muted-foreground ml-1">by {entry.userId}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = score != null ? Math.min(Math.round(score), 100) : 0;
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{score != null ? Math.round(score) : '—'}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <ScoreBadge score={score} size="md" />
    </div>
  );
}

function ComplianceIndicator({ lead }: { lead: LeadWithProperty }) {
  if (lead.status === 'COMPLIANCE_PENDING') {
    return (
      <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Checking...
      </Badge>
    );
  }
  if (lead.complianceCleared) {
    return (
      <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
        <Shield className="mr-1 h-3 w-3" />
        Cleared
      </Badge>
    );
  }
  if (lead.status === 'DEAD' && !lead.complianceCleared) {
    return (
      <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
        <XCircle className="mr-1 h-3 w-3" />
        Blocked
      </Badge>
    );
  }
  return null;
}

function StatusActions({
  lead,
  onClaim,
  onCompliance,
  onTransition,
  loading,
}: {
  lead: LeadWithProperty;
  onClaim: () => void;
  onCompliance: () => void;
  onTransition: (status: string) => void;
  loading: boolean;
}) {
  const actions: Record<string, { label: string; icon: React.ReactNode; action: () => void }[]> = {
    PROMOTED: [
      { label: 'Claim Lead', icon: <UserPlus className="mr-1.5 h-3.5 w-3.5" />, action: onClaim },
    ],
    ASSIGNED: [
      { label: 'Start Compliance', icon: <Shield className="mr-1.5 h-3.5 w-3.5" />, action: onCompliance },
    ],
    DIAL_READY: [
      { label: 'Start Dialing', icon: <Phone className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('DIALING') },
    ],
    DIALING: [
      { label: 'Log Disposition', icon: <MessageSquare className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CONTACTED') },
    ],
    CONTACTED: [
      { label: 'Send Offer', icon: <Send className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('OFFER_SENT') },
    ],
    OFFER_SENT: [
      { label: 'Mark Contracted', icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CONTRACTED') },
    ],
    CONTRACTED: [
      { label: 'Mark Closed', icon: <CheckCircle className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CLOSED') },
    ],
  };

  const available = actions[lead.status] ?? [];

  return (
    <>
      {available.map(a => (
        <Button key={a.label} size="sm" disabled={loading} onClick={a.action}>
          {a.icon}
          {a.label}
        </Button>
      ))}

      {lead.status !== 'CLOSED' && lead.status !== 'DEAD' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading} className="text-destructive">
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Mark Dead
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark lead as dead?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently close this lead. It cannot be re-opened.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onTransition('DEAD')}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
}
