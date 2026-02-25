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
import {
  usePropertyDetail,
  usePropertyEvents,
  usePropertyContacts,
  useLeadHistory,
  usePropertyTasks,
  usePropertyTags,
} from '@/hooks/use-property-detail';
import type { PropertyContact, TimelineItem } from '@/hooks/use-property-detail';
import { ScoreBreakdownTooltip, EVENT_LABELS } from '@/components/scoring/score-breakdown-tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useDealStageTransition } from '@/hooks/use-pipeline';
import { useAddTag, useRemoveTag } from '@/hooks/use-tags';
import type { LeadWithProperty, AuditLogEntry, DistressEvent, Tag } from '@/lib/types';
import { DEAL_STAGES, VALID_DEAL_TRANSITIONS } from '@/lib/constants';
import { format, formatDistanceToNow } from 'date-fns';
import {
  UserPlus, Shield, Phone, MessageSquare, Send, FileText,
  CheckCircle, XCircle, AlertTriangle, SearchCheck, Zap,
  Mail, MapPin, Home, Calendar, TrendingUp, ArrowRight,
  ClipboardCheck, DollarSign,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLeadNotes, useAddNote } from '@/hooks/use-notes';
import { CompsTab } from '@/components/comps/comps-tab';
import { OffersTab } from '@/components/offers/offers-tab';
import { NewOfferDialog } from '@/components/offers/new-offer-dialog';
import { FunnelStageBadge } from '@/components/funnel/funnel-stage-badge';
import { useFunnelAdvance, useFunnelDecline } from '@/hooks/use-funnel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { FunnelStage } from '@/lib/types';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

interface PropertyDetailSheetProps {
  lead: LeadWithProperty | null;
  open: boolean;
  onClose: () => void;
}

export function PropertyDetailSheet({ lead, open, onClose }: PropertyDetailSheetProps) {
  const [tab, setTab] = useState('overview');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [funnelOfferDialog, setFunnelOfferDialog] = useState(false);
  const [funnelOfferAmount, setFunnelOfferAmount] = useState('');
  const [enriching, setEnriching] = useState(false);
  const { accessToken } = useAuth();

  const claimMutation = useClaimLead();
  const transitionMutation = useTransitionLead();
  const complianceMutation = useRunCompliance();
  const skipTraceMutation = useSkipTrace();
  const dealStageMutation = useDealStageTransition();
  const funnelAdvance = useFunnelAdvance();
  const funnelDecline = useFunnelDecline();
  const addTagMutation = useAddTag();
  const removeTagMutation = useRemoveTag();

  const propertyDetail = usePropertyDetail(lead?.dominionLeadId ?? null);
  const events = usePropertyEvents(lead?.dominionLeadId ?? null);
  const contacts = usePropertyContacts(lead?.dominionLeadId ?? null);
  const history = useLeadHistory(lead?.leadInstanceId ?? null);
  const tasks = usePropertyTasks(lead?.dominionLeadId ?? null);
  const tags = usePropertyTags(lead?.leadInstanceId ?? null);
  const auditQuery = useLeadAudit(lead?.dominionLeadId ?? null);

  if (!lead) return null;

  const property = propertyDetail.data;
  const isLoading = claimMutation.isPending || transitionMutation.isPending || complianceMutation.isPending;

  async function handleEnrich() {
    setEnriching(true);
    try {
      const res = await fetch(`${API_URL}/api/properties/${lead.dominionLeadId}/enrich`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) toast.success('Property data enrichment queued');
      else toast.error('Enrichment failed');
    } catch {
      toast.error('Enrichment failed');
    } finally {
      setEnriching(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[75vw] max-w-[75vw] overflow-hidden flex flex-col p-0">
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

        <FunnelActionBar
          lead={lead}
          onAdvance={(targetStage, opts) => {
            if (targetStage === 'negotiation') {
              setFunnelOfferDialog(true);
              return;
            }
            funnelAdvance.mutate(
              { leadInstanceId: lead.leadInstanceId, targetStage, ...opts },
              { onSuccess: () => { toast.success(`Moved to ${targetStage}`); onClose(); } },
            );
          }}
          onDecline={() => {
            funnelDecline.mutate(
              { leadInstanceId: lead.leadInstanceId },
              { onSuccess: () => { toast.success('Declined'); onClose(); } },
            );
          }}
          loading={funnelAdvance.isPending || funnelDecline.isPending}
        />

        <Dialog open={funnelOfferDialog} onOpenChange={setFunnelOfferDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Move to Negotiation</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">{lead.streetAddress}</p>
              <div>
                <Label>Offer Amount ($)</Label>
                <Input type="number" placeholder="150000" value={funnelOfferAmount}
                  onChange={(e) => setFunnelOfferAmount(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFunnelOfferDialog(false)}>Cancel</Button>
              <Button disabled={funnelAdvance.isPending} onClick={() => {
                const cents = Math.round(parseFloat(funnelOfferAmount) * 100);
                if (isNaN(cents) || cents <= 0) { toast.error('Enter a valid amount'); return; }
                funnelAdvance.mutate(
                  { leadInstanceId: lead.leadInstanceId, targetStage: 'negotiation', offerAmountCents: cents },
                  { onSuccess: () => { setFunnelOfferDialog(false); setFunnelOfferAmount(''); toast.success('Moved to Negotiation'); onClose(); } },
                );
              }}>Move to Negotiation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="signals">
              Signals{events.data?.length ? ` (${events.data.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="contacts">
              Contacts{contacts.data?.length ? ` (${contacts.data.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks{tasks.data?.length ? ` (${tasks.data.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="comps">Comps</TabsTrigger>
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
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <span className="cursor-help inline-flex">
                              <ScoreBadge score={lead.compositeScore} size="md" />
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80" side="left">
                            <ScoreBreakdownTooltip
                              compositeScore={lead.compositeScore}
                              motivationScore={lead.motivationScore ?? null}
                              dealScore={lead.dealScore ?? null}
                              dominionLeadId={lead.dominionLeadId}
                            />
                          </HoverCardContent>
                        </HoverCard>
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
                        {(() => {
                          const currentDealStage = (lead as unknown as { dealStage?: string }).dealStage ?? 'NEW_LEAD';
                          const validNextStages = VALID_DEAL_TRANSITIONS[currentDealStage] ?? [];
                          return (
                            <Select
                              value={currentDealStage}
                              onValueChange={(stage) => dealStageMutation.mutate({
                                leadInstanceId: lead.leadInstanceId,
                                stage,
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={currentDealStage} className="text-xs" disabled>
                                  {DEAL_STAGES.find(s => s.key === currentDealStage)?.label ?? currentDealStage} (current)
                                </SelectItem>
                                {DEAL_STAGES
                                  .filter(s => validNextStages.includes(s.key))
                                  .map(s => (
                                    <SelectItem key={s.key} value={s.key} className="text-xs">
                                      {s.label}
                                    </SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          );
                        })()}
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
                        <InfoRow icon={FileText} label="APN" value={property.apn} />
                        <InfoRow icon={TrendingUp} label="Equity Est." value={property.equityEstimate ? `$${Number(property.equityEstimate).toLocaleString()}` : null} />
                        <InfoRow icon={Calendar} label="Ownership" value={property.ownershipDurationMonths ? `${Math.round(property.ownershipDurationMonths / 12)} years` : null} />
                        <InfoRow icon={Home} label="Mortgage" value={property.mortgageStatus ?? null} />
                        <InfoRow icon={MapPin} label="Absentee" value={property.absenteeOwner ? 'Yes' : 'No'} />
                        <InfoRow icon={Mail} label="Mailing" value={property.mailingAddress ?? null} />
                        <InfoRow icon={SearchCheck} label="Skip Traced" value={property.skipTracedAt ? format(new Date(property.skipTracedAt), 'MMM d, yyyy') : 'Not yet'} />
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
                    <Button size="sm" variant="outline" onClick={() => setOfferDialogOpen(true)}>
                      <DollarSign className="mr-1.5 h-3.5 w-3.5" />Make Offer
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleEnrich} disabled={enriching}>
                      {enriching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      🔄 Pull Property Data
                    </Button>
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
                      CONTACTS
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

                  {contacts.isLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                  ) : (contacts.data ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {(contacts.data ?? []).map((c: PropertyContact) => (
                        <EnhancedContactCard key={c.contactId} contact={c} />
                      ))}
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </TabsContent>

              {/* ─── Signals Tab ─── */}
              <TabsContent value="signals" className="space-y-4 mt-4">
                <h4 className="text-sm font-semibold text-muted-foreground">
                  DISTRESS SIGNALS ({events.data?.length ?? 0})
                </h4>
                {events.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : (events.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No distress signals recorded</p>
                ) : (
                  <div className="space-y-2">
                    {(events.data ?? []).map((event: DistressEvent) => (
                      <SignalCard key={event.eventId} event={event} />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ─── History Tab ─── */}
              <TabsContent value="history" className="space-y-4 mt-4">
                <h4 className="text-sm font-semibold text-muted-foreground">HISTORY</h4>
                {history.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (history.data ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {(history.data ?? []).map((item: TimelineItem, i: number) => (
                      <TimelineEntry key={i} item={item} />
                    ))}
                  </div>
                ) : (auditQuery.data ?? []).length > 0 ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground">No history available</p>
                )}
              </TabsContent>

              {/* ─── Notes Tab ─── */}
              <TabsContent value="notes" className="space-y-4 mt-4">
                <NotesTab leadInstanceId={lead.leadInstanceId} legacyNotes={lead.notes} />
              </TabsContent>

              {/* ─── Tasks Tab ─── */}
              <TabsContent value="tasks" className="space-y-4 mt-4">
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

              {/* ─── Offers Tab ─── */}
              <TabsContent value="offers" className="space-y-4 mt-4">
                <OffersTab
                  lead={lead}
                  onNewOffer={() => setOfferDialogOpen(true)}
                />
              </TabsContent>

              {/* ─── Comps Tab ─── */}
              <TabsContent value="comps" className="space-y-4 mt-4">
                <CompsTab dominionLeadId={lead.dominionLeadId} />
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

        <NewOfferDialog
          open={offerDialogOpen}
          onOpenChange={setOfferDialogOpen}
          prefill={{
            dominionLeadId: lead.dominionLeadId,
            propertyId: (property as unknown as { propertyId?: string })?.propertyId ?? lead.dominionLeadId,
            leadInstanceId: lead.leadInstanceId,
            address: `${lead.streetAddress ?? ''}${lead.city ? `, ${lead.city}` : ''}`,
            ownerName: lead.ownerName ?? undefined,
          }}
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

function NotesTab({ leadInstanceId, legacyNotes }: { leadInstanceId: string; legacyNotes: string | null }) {
  const [noteText, setNoteText] = useState('');
  const notes = useLeadNotes(leadInstanceId);
  const addNote = useAddNote();

  const handleAdd = () => {
    if (!noteText.trim()) return;
    addNote.mutate(
      { leadInstanceId, text: noteText.trim() },
      { onSuccess: () => setNoteText('') },
    );
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground">NOTES</h4>
      <div className="flex gap-2">
        <Textarea
          value={noteText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNoteText(e.target.value)}
          placeholder="Add a note..."
          className="min-h-[80px]"
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd();
          }}
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!noteText.trim() || addNote.isPending}
          className="self-end"
        >
          Add
        </Button>
      </div>
      {legacyNotes && (
        <div className="border rounded-lg p-3 bg-muted/30">
          <p className="text-sm whitespace-pre-wrap">{legacyNotes}</p>
          <p className="text-xs text-muted-foreground mt-2">Legacy note</p>
        </div>
      )}
      {notes.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (notes.data ?? []).length === 0 && !legacyNotes ? (
        <p className="text-sm text-muted-foreground">No notes yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {(notes.data ?? []).map((note: { activityId: string; text: string; createdBy: string | null; createdAt: string }) => (
            <div key={note.activityId} className="border rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{note.text}</p>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{note.createdBy ?? 'System'}</span>
                <span>{format(new Date(note.createdAt), 'MMM d, h:mm a')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalCard({ event }: { event: DistressEvent }) {
  const config = EVENT_LABELS[event.eventType] ?? { label: event.eventType.replace(/_/g, ' '), severity: 'low' as const };
  const severityColor = {
    high: 'text-red-500 bg-red-500/10',
    medium: 'text-amber-500 bg-amber-500/10',
    low: 'text-blue-500 bg-blue-500/10',
  };

  return (
    <div className="flex items-start justify-between rounded-lg border p-3">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant={event.eventLayer === 'CONFIRMED' ? 'destructive' : 'secondary'} className="text-[10px]">
            {event.eventLayer}
          </Badge>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityColor[config.severity]}`}>
            {config.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Source: {event.source} {event.eventDate ? ` | ${format(new Date(event.eventDate), 'MMM d, yyyy')}` : ''}
        </p>
      </div>
    </div>
  );
}

function EnhancedContactCard({ contact }: { contact: PropertyContact }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        {contact.isPrimary && <span className="text-amber-500">&#9733;</span>}
        <span className="text-sm font-medium">{contact.fullName ?? 'Unknown'}</span>
        {contact.contactType && (
          <Badge variant="outline" className="text-[10px]">{contact.contactType}</Badge>
        )}
        {contact.dndCalls && <Badge variant="destructive" className="text-[10px]">DNC</Badge>}
      </div>
      {contact.phone && (
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-3.5 w-3.5 text-green-600" />
          <span className="font-mono">{formatPhone(contact.phone)}</span>
          {contact.phoneType && <span className="text-xs text-muted-foreground">({contact.phoneType})</span>}
          {contact.phoneStatus && <span className="text-xs text-muted-foreground">{contact.phoneStatus}</span>}
        </div>
      )}
      {contact.email && (
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-3.5 w-3.5 text-blue-600" />
          <span>{contact.email}</span>
        </div>
      )}
      {contact.source && (
        <div className="text-xs text-muted-foreground">Source: {contact.source}</div>
      )}
    </div>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const iconMap: Record<string, React.ReactNode> = {
    call: <Phone className="h-3.5 w-3.5 text-blue-500" />,
    sms: <MessageSquare className="h-3.5 w-3.5 text-green-500" />,
    disposition: <ClipboardCheck className="h-3.5 w-3.5 text-amber-500" />,
    status_change: <ArrowRight className="h-3.5 w-3.5 text-purple-500" />,
  };

  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-1">{iconMap[item.type]}</div>
      <div className="flex-1">
        <p className="font-medium">{item.summary}</p>
        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
      </span>
    </div>
  );
}

function formatPhone(phone: string): string {
  if (phone.length === 10) return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  return phone;
}

function FunnelActionBar({
  lead,
  onAdvance,
  onDecline,
  loading,
}: {
  lead: LeadWithProperty;
  onAdvance: (targetStage: string, opts?: { notes?: string }) => void;
  onDecline: () => void;
  loading: boolean;
}) {
  const funnelStage = ((lead as LeadWithProperty & { funnelStage?: string }).funnelStage ?? 'prospect') as FunnelStage;

  const actions: Record<FunnelStage, { forward?: { label: string; stage: string }; canDecline: boolean }> = {
    prospect: { forward: { label: 'Move to Leads', stage: 'lead' }, canDecline: false },
    lead: { forward: { label: 'Move to Negotiation', stage: 'negotiation' }, canDecline: true },
    paid_lead: { forward: { label: 'Move to Negotiation', stage: 'negotiation' }, canDecline: true },
    negotiation: { forward: { label: 'Mark Accepted', stage: 'disposition' }, canDecline: true },
    disposition: { forward: undefined, canDecline: false },
    declined: { forward: { label: 'Re-engage', stage: 'lead' }, canDecline: false },
  };

  const config = actions[funnelStage] ?? actions.prospect;

  return (
    <div className="mx-6 mb-2 rounded-md border border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Stage:</span>
        <FunnelStageBadge stage={funnelStage} />
      </div>
      <div className="flex items-center gap-2">
        {config.forward && (
          <Button size="sm" disabled={loading} onClick={() => onAdvance(config.forward!.stage)}>
            {config.forward.label}
          </Button>
        )}
        {config.canDecline && (
          <Button size="sm" variant="ghost" className="text-red-400" disabled={loading} onClick={onDecline}>
            Decline
          </Button>
        )}
      </div>
    </div>
  );
}
