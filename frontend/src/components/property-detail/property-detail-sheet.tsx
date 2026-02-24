'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TagBadge } from '@/components/tags/tag-badge';
import { TagSelector } from '@/components/tags/tag-selector';
import { TaskList } from '@/components/tasks/task-list';
import { CreateTaskDialog } from '@/components/tasks/create-task-dialog';
import {
  useClaimLead,
  useTransitionLead,
  useRunCompliance,
  useLeadAudit,
} from '@/hooks/use-leads';
import { useSkipTrace } from '@/hooks/use-skip-trace';
import { usePropertyDetail, usePropertyEvents, usePropertyTasks, usePropertyTags } from '@/hooks/use-property-detail';
import { useDealStageTransition } from '@/hooks/use-pipeline';
import { useAddTag, useRemoveTag } from '@/hooks/use-tags';
import type { LeadWithProperty, AuditLogEntry, DistressEvent, Tag } from '@/lib/types';
import { DEAL_STAGES } from '@/lib/constants';
import { format } from 'date-fns';
import {
  UserPlus, Shield, Phone, MessageSquare, Send, FileText,
  CheckCircle, XCircle, AlertTriangle, SearchCheck, Zap,
  Mail, MapPin, Home, Calendar, TrendingUp,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const VALID_DEAL_TRANSITIONS: Record<string, string[]> = {
  NEW_LEAD:       ['SKIP_TRACED', 'DEAD'],
  SKIP_TRACED:    ['CONTACTED', 'DEAD'],
  CONTACTED:      ['INTERESTED', 'DEAD'],
  INTERESTED:     ['OFFER_MADE', 'DEAD'],
  OFFER_MADE:     ['UNDER_CONTRACT', 'DEAD'],
  UNDER_CONTRACT: ['TITLE_ESCROW', 'CLOSED_LOST'],
  TITLE_ESCROW:   ['CLOSED_WON', 'CLOSED_LOST'],
  CLOSED_WON:     [],
  CLOSED_LOST:    [],
  DEAD:           ['NEW_LEAD'],
};

interface PropertyDetailSheetProps {
  lead: LeadWithProperty | null;
  open: boolean;
  onClose: () => void;
}

export function PropertyDetailSheet({ lead, open, onClose }: PropertyDetailSheetProps) {
  const [tab, setTab] = useState('overview');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const claimMutation = useClaimLead();
  const transitionMutation = useTransitionLead();
  const complianceMutation = useRunCompliance();
  const skipTraceMutation = useSkipTrace();
  const dealStageMutation = useDealStageTransition();
  const addTagMutation = useAddTag();
  const removeTagMutation = useRemoveTag();

  const propertyDetail = usePropertyDetail(lead?.dominionLeadId ?? null);
  const events = usePropertyEvents(lead?.dominionLeadId ?? null);
  const tasks = usePropertyTasks(lead?.dominionLeadId ?? null);
  const tags = usePropertyTags(lead?.leadInstanceId ?? null);
  const auditQuery = useLeadAudit(lead?.dominionLeadId ?? null);

  if (!lead) return null;

  const property = propertyDetail.data;
  const isLoading = claimMutation.isPending || transitionMutation.isPending || complianceMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 space-y-1">
          <SheetTitle className="text-lg">
            {lead.streetAddress ?? 'Unknown Address'}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {property?.apn ? `APN: ${property.apn} | ` : ''}
            {lead.county ?? '—'}{lead.city ? `, ${lead.city}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">
            {lead.ownerName ?? 'Unknown Owner'}
          </p>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="px-6 pb-6">

              {/* ─── Overview Tab ─── */}
              <TabsContent value="overview" className="space-y-6 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Scoring */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">SCORING</h4>
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Composite</span>
                        <ScoreBadge score={lead.compositeScore} size="md" />
                      </div>
                      {lead.compositeScore !== null && (
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              (lead.compositeScore ?? 0) >= 80 ? 'bg-green-500' :
                              (lead.compositeScore ?? 0) >= 60 ? 'bg-yellow-500' :
                              (lead.compositeScore ?? 0) >= 40 ? 'bg-orange-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${lead.compositeScore ?? 0}%` }}
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Motivation</span>
                          <span className="font-medium">{lead.motivationScore ?? '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Deal</span>
                          <span className="font-medium">{lead.dealScore ?? '—'}</span>
                        </div>
                      </div>
                      {lead.confidenceScore !== null && lead.confidenceScore !== undefined && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Confidence</span>
                          <span className="font-medium">{Math.round(lead.confidenceScore * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Deal Status */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">DEAL STATUS</h4>
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status</span>
                        <StatusBadge status={lead.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Assigned</span>
                        <span className="text-xs">{lead.assignedTo ?? '—'}</span>
                      </div>
                      <ComplianceIndicator lead={lead} />
                      <Separator />
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">Deal Stage</span>
                        <Select
                          value={(lead as unknown as { dealStage?: string }).dealStage ?? 'NEW_LEAD'}
                          onValueChange={(stage) => dealStageMutation.mutate({
                            leadInstanceId: lead.leadInstanceId,
                            stage,
                          })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const currentStage = (lead as unknown as { dealStage?: string }).dealStage ?? 'NEW_LEAD';
                              const validNext = VALID_DEAL_TRANSITIONS[currentStage] ?? [];
                              return DEAL_STAGES.filter(s => s.key === currentStage || validNext.includes(s.key)).map(s => (
                                <SelectItem key={s.key} value={s.key} className="text-xs">
                                  {s.label}
                                </SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Property Info */}
                {property && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground">PROPERTY INFO</h4>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                        <InfoRow icon={Home} label="Address" value={property.streetAddress} />
                        <InfoRow icon={MapPin} label="City" value={`${property.city ?? '—'}, ${property.state ?? '—'} ${property.zip ?? ''}`} />
                        <InfoRow icon={TrendingUp} label="Equity Est." value={property.equityEstimate ? `$${Number(property.equityEstimate).toLocaleString()}` : null} />
                        <InfoRow icon={Calendar} label="Ownership" value={property.ownershipDurationMonths ? `${Math.round(property.ownershipDurationMonths / 12)} years` : null} />
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">ACTIONS</h4>
                  <div className="flex flex-wrap gap-2">
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
                      loading={isLoading}
                    />
                  </div>
                </div>

                <Separator />

                {/* Tags */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">TAGS</h4>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {(tags.data ?? []).map((tag: Tag) => (
                      <TagBadge
                        key={tag.tagId}
                        tag={tag}
                        onRemove={() => removeTagMutation.mutate({
                          leadInstanceId: lead.leadInstanceId,
                          tagId: tag.tagId,
                        })}
                      />
                    ))}
                    <TagSelector
                      leadInstanceId={lead.leadInstanceId}
                      existingTagIds={(tags.data ?? []).map((t: Tag) => t.tagId)}
                      onAdd={(tagId) => addTagMutation.mutate({
                        leadInstanceId: lead.leadInstanceId,
                        tagId,
                      })}
                    />
                  </div>
                </div>

                <Separator />

                {/* Tasks */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-muted-foreground">TASKS</h4>
                    <Button size="sm" variant="outline" onClick={() => setTaskDialogOpen(true)}>
                      + New Task
                    </Button>
                  </div>
                  <TaskList tasks={tasks.data ?? []} />
                </div>
              </TabsContent>

              {/* ─── Contacts Tab ─── */}
              <TabsContent value="contacts" className="space-y-6 mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      CONTACTS ({[lead.phone, lead.phone2, lead.phone3].filter(Boolean).length} phones)
                    </h4>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        disabled={skipTraceMutation.isPending}
                        onClick={() => skipTraceMutation.mutate({
                          dominionLeadId: lead.dominionLeadId, tier: 'STANDARD',
                        })}
                      >
                        <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
                        {skipTraceMutation.isPending ? 'Tracing...' : 'Standard Trace'}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={skipTraceMutation.isPending}
                        onClick={() => skipTraceMutation.mutate({
                          dominionLeadId: lead.dominionLeadId, tier: 'ADVANCED',
                        })}
                      >
                        <Zap className="mr-1.5 h-3.5 w-3.5" />
                        Advanced
                      </Button>
                    </div>
                  </div>

                  <ContactCard
                    name={lead.ownerName ?? 'Owner'}
                    relation="Owner"
                    phone={lead.phone}
                    phoneType={lead.phoneType}
                    email={lead.email}
                    source={lead.skipTraceSource}
                    tracedAt={lead.skipTracedAt}
                    isPrimary
                  />
                  {lead.phone2 && (
                    <ContactCard
                      name="Additional Contact"
                      relation="Unknown"
                      phone={lead.phone2}
                      phoneType={lead.phone2Type}
                      email={lead.email2}
                      source={lead.skipTraceSource}
                      tracedAt={lead.skipTracedAt}
                    />
                  )}
                  {lead.phone3 && (
                    <ContactCard
                      name="Additional Contact"
                      relation="Unknown"
                      phone={lead.phone3}
                      phoneType={lead.phone3Type}
                      source={lead.skipTraceSource}
                      tracedAt={lead.skipTracedAt}
                    />
                  )}
                  {!lead.phone && !lead.phone2 && !lead.phone3 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-center space-y-2">
                      <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 mx-auto" />
                      <p className="text-sm font-medium">No contact data available</p>
                      <p className="text-xs text-muted-foreground">Run a skip trace to find phone numbers and emails.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ─── Events Tab ─── */}
              <TabsContent value="events" className="space-y-4 mt-4">
                <h4 className="text-sm font-semibold text-muted-foreground">
                  DISTRESS EVENTS ({events.data?.length ?? 0})
                </h4>
                {events.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : (events.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No distress events recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {(events.data ?? []).map((event: DistressEvent) => (
                      <EventCard key={event.eventId} event={event} />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ─── Activity Tab ─── */}
              <TabsContent value="activity" className="space-y-4 mt-4">
                <h4 className="text-sm font-semibold text-muted-foreground">HISTORY</h4>
                {auditQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (auditQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history available</p>
                ) : (
                  <div className="space-y-2">
                    {(auditQuery.data ?? []).slice(0, 30).map((entry: AuditLogEntry) => (
                      <div key={entry.logId} className="flex items-start gap-2 text-xs">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
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
              </TabsContent>

              {/* ─── Notes Tab ─── */}
              <TabsContent value="notes" className="space-y-4 mt-4">
                <h4 className="text-sm font-semibold text-muted-foreground">NOTES</h4>
                {lead.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes recorded.</p>
                )}
              </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>

        <CreateTaskDialog
          open={taskDialogOpen}
          onClose={() => setTaskDialogOpen(false)}
          dominionLeadId={lead.dominionLeadId}
          leadInstanceId={lead.leadInstanceId}
        />
      </SheetContent>
    </Sheet>
  );
}

function ComplianceIndicator({ lead }: { lead: LeadWithProperty }) {
  if (lead.status === 'COMPLIANCE_PENDING') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Compliance</span>
        <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-xs">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Checking
        </Badge>
      </div>
    );
  }
  if (lead.complianceCleared) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Compliance</span>
        <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs">
          <Shield className="mr-1 h-3 w-3" />
          Cleared
        </Badge>
      </div>
    );
  }
  return null;
}

function ContactCard({
  name, relation, phone, phoneType, email, source, tracedAt, isPrimary,
}: {
  name: string;
  relation: string;
  phone: string | null;
  phoneType: string | null;
  email?: string | null;
  source?: string | null;
  tracedAt?: string | null;
  isPrimary?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isPrimary && <span className="text-amber-500">&#9733;</span>}
          <span className="text-sm font-medium">{name}</span>
          <Badge variant="outline" className="text-[10px]">{relation}</Badge>
        </div>
      </div>
      {phone && (
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-3.5 w-3.5 text-green-600" />
          <span className="font-mono">{formatPhone(phone)}</span>
          {phoneType && <span className="text-xs text-muted-foreground">({phoneType})</span>}
        </div>
      )}
      {email && (
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-3.5 w-3.5 text-blue-600" />
          <span>{email}</span>
        </div>
      )}
      {source && (
        <div className="text-xs text-muted-foreground">
          Source: {source}
          {tracedAt && ` | ${format(new Date(tracedAt), 'MMM d, yyyy')}`}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: DistressEvent }) {
  const severityColor =
    event.severityLevel === 'HIGH' || event.severityLevel === 'CRITICAL'
      ? 'text-red-600 dark:text-red-400'
      : event.severityLevel === 'MODERATE'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-green-600 dark:text-green-400';

  const dot =
    event.severityLevel === 'HIGH' || event.severityLevel === 'CRITICAL'
      ? 'bg-red-500' : event.severityLevel === 'MODERATE'
      ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-sm font-medium">{event.eventType.replace(/_/g, ' ')}</span>
        <span className={`text-xs ${severityColor}`}>({event.severityLevel})</span>
      </div>
      <div className="text-xs text-muted-foreground">
        Source: {event.source} | {event.eventLayer}
        {event.eventDate && ` | ${format(new Date(event.eventDate), 'MMM d, yyyy')}`}
      </div>
    </div>
  );
}

function StatusActions({
  lead, onClaim, onCompliance, onTransition, loading,
}: {
  lead: LeadWithProperty;
  onClaim: () => void;
  onCompliance: () => void;
  onTransition: (status: string) => void;
  loading: boolean;
}) {
  const actions: Record<string, { label: string; icon: React.ReactNode; action: () => void }[]> = {
    PROMOTED: [{ label: 'Claim Lead', icon: <UserPlus className="mr-1.5 h-3.5 w-3.5" />, action: onClaim }],
    ASSIGNED: [{ label: 'Run Compliance', icon: <Shield className="mr-1.5 h-3.5 w-3.5" />, action: onCompliance }],
    DIAL_READY: [{ label: 'Start Dialing', icon: <Phone className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('DIALING') }],
    DIALING: [{ label: 'Mark Contacted', icon: <MessageSquare className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CONTACTED') }],
    CONTACTED: [{ label: 'Send Offer', icon: <Send className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('OFFER_SENT') }],
    OFFER_SENT: [{ label: 'Mark Contracted', icon: <FileText className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CONTRACTED') }],
    CONTRACTED: [{ label: 'Mark Closed', icon: <CheckCircle className="mr-1.5 h-3.5 w-3.5" />, action: () => onTransition('CLOSED') }],
  };

  const available = actions[lead.status] ?? [];

  return (
    <>
      {available.map(a => (
        <Button key={a.label} size="sm" disabled={loading} onClick={a.action}>
          {a.icon}{a.label}
        </Button>
      ))}
      {lead.status !== 'CLOSED' && lead.status !== 'DEAD' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading} className="text-destructive">
              <XCircle className="mr-1.5 h-3.5 w-3.5" />Mark Dead
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark lead as dead?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently close this lead. It cannot be re-opened.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onTransition('DEAD')}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
      <span className="text-xs font-medium truncate">{value ?? '—'}</span>
    </div>
  );
}

function formatPhone(phone: string): string {
  if (phone.length === 10) return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  return phone;
}
