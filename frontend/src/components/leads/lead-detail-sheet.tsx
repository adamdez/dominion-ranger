'use client';

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
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useClaimLead,
  useTransitionLead,
  useRunCompliance,
  useLeadAudit,
} from '@/hooks/use-leads';
import { useSkipTrace } from '@/hooks/use-skip-trace';
import { SmsPanel } from '@/components/dialer/sms-panel';
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
  SearchCheck,
  Zap,
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
  const skipTraceMutation = useSkipTrace();
  const auditQuery = useLeadAudit(lead?.dominionLeadId ?? null);

  if (!lead) return null;

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

        <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="messages" className="flex-1">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="messages" className="flex-1 min-h-0 mt-0">
            <SmsPanel
              dominionLeadId={lead.dominionLeadId}
              toPhone={lead.phone}
              leadInstanceId={lead.leadInstanceId}
            />
          </TabsContent>

          <TabsContent value="details" className="flex-1 min-h-0 mt-0">
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* Score Section */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">SCORING</h3>
              <div className="grid grid-cols-3 gap-3">
                <ScoreCard label="Composite" score={lead.compositeScore} />
                <ScoreCard label="Motivation" score={lead.motivationScore} />
                <ScoreCard label="Deal" score={lead.dealScore} />
              </div>
              {lead.confidenceScore !== null && lead.confidenceScore !== undefined && (
                <div className="mt-2">
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
                <PhoneRow label="Phone" number={lead.phone} type={lead.phoneType} />
                <PhoneRow label="Phone 2" number={lead.phone2} type={lead.phone2Type} />
                <PhoneRow label="Phone 3" number={lead.phone3} type={lead.phone3Type} />
                <InfoRow label="Email" value={lead.email} />
                {lead.email2 && <InfoRow label="Email 2" value={lead.email2} />}
                <InfoRow label="Assigned To" value={lead.assignedTo} />
              </div>
              {lead.skipTracedAt ? (
                <p className="text-xs text-muted-foreground mt-2">
                  Traced via {lead.skipTraceSource} ({lead.skipTraceTier}) •{' '}
                  {formatDistanceToNow(new Date(lead.skipTracedAt), { addSuffix: true })}
                </p>
              ) : null}
            </section>

            {/* Skip Trace Actions */}
            <section className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={skipTraceMutation.isPending}
                onClick={() => skipTraceMutation.mutate({
                  dominionLeadId: lead.dominionLeadId,
                  tier: 'STANDARD',
                })}
              >
                <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
                {skipTraceMutation.isPending ? 'Tracing...' : 'Standard Trace'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={skipTraceMutation.isPending}
                onClick={() => skipTraceMutation.mutate({
                  dominionLeadId: lead.dominionLeadId,
                  tier: 'ADVANCED',
                })}
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Advanced Trace
              </Button>
            </section>

            <Separator />

            {/* Audit History */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">HISTORY</h3>
              {auditQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (auditQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No history available</p>
              ) : (
                <div className="space-y-2">
                  {(auditQuery.data ?? []).slice(0, 15).map((entry: AuditLogEntry) => (
                    <div key={entry.logId} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{entry.actionType}</span>
                        <span className="text-muted-foreground ml-1">
                          {format(new Date(entry.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
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
  const actions: Record<string, { label: string; icon: React.ReactNode; action: () => void; variant?: 'default' | 'outline' }[]> = {
    PROMOTED: [
      { label: 'Claim Lead', icon: <UserPlus className="mr-1.5 h-3.5 w-3.5" />, action: onClaim },
    ],
    ASSIGNED: [
      { label: 'Run Compliance', icon: <Shield className="mr-1.5 h-3.5 w-3.5" />, action: onCompliance },
    ],
    DIAL_READY: [
      { label: 'Start Dialing', icon: <Phone className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('DIALING') },
    ],
    DIALING: [
      { label: 'Mark Contacted', icon: <MessageSquare className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CONTACTED') },
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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
}

function PhoneRow({ label, number, type }: { label: string; number: string | null | undefined; type: string | null | undefined }) {
  if (!number) return null;
  const formatted = number.length === 10
    ? `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`
    : number;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {formatted}
        {type && <span className="text-xs text-muted-foreground ml-1">({type})</span>}
      </span>
    </div>
  );
}
