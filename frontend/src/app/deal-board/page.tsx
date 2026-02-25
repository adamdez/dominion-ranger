'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Kanban, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/empty-state';
import { LeadCard } from '@/components/pipeline/lead-card';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useLeads } from '@/hooks/use-leads';
import { useDealStageTransition } from '@/hooks/use-pipeline';
import { DEAL_STAGES } from '@/lib/constants';
import type { LeadWithProperty, PipelineLead } from '@/lib/types';

function mapStatusToDealStage(status: string): string {
  const mapping: Record<string, string> = {
    PROMOTED: 'NEW_LEAD', ASSIGNED: 'NEW_LEAD', COMPLIANCE_PENDING: 'NEW_LEAD',
    DIAL_READY: 'NEW_LEAD', DIALING: 'CONTACTED', CONTACTED: 'CONTACTED',
    OFFER_SENT: 'OFFER_MADE', CONTRACTED: 'UNDER_CONTRACT',
    CLOSED: 'CLOSED_WON', DEAD: 'CLOSED_LOST',
  };
  return mapping[status] ?? 'NEW_LEAD';
}

export default function DealBoardPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadWithProperty | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  const { data, isLoading } = useLeads({ page: 1, pageSize: 200, search: search || undefined, sortBy: 'compositeScore', sortOrder: 'desc' });
  const dealStageMutation = useDealStageTransition();

  const pipelineLeads: PipelineLead[] = (data?.data ?? []).map((lead) => ({
    ...lead,
    dealStage: (lead as LeadWithProperty & { dealStage?: string }).dealStage ?? mapStatusToDealStage(lead.status),
    tags: (lead as PipelineLead).tags ?? [],
  }));

  const columns = useMemo(() => {
    const grouped: Record<string, PipelineLead[]> = {};
    for (const stage of DEAL_STAGES) grouped[stage.key] = [];
    for (const lead of pipelineLeads) {
      const stage = optimisticMoves[lead.leadInstanceId] ?? lead.dealStage ?? mapStatusToDealStage(lead.status);
      const pl: PipelineLead = { ...lead, dealStage: stage, tags: (lead as PipelineLead).tags ?? [] };
      if (grouped[stage]) grouped[stage].push(pl);
    }
    return grouped;
  }, [pipelineLeads, optimisticMoves]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStage = destination.droppableId;
    setOptimisticMoves(prev => ({ ...prev, [draggableId]: newStage }));
    dealStageMutation.mutate({ leadInstanceId: draggableId, stage: newStage }, {
      onError: () => setOptimisticMoves(prev => { const next = { ...prev }; delete next[draggableId]; return next; }),
      onSuccess: () => setOptimisticMoves(prev => { const next = { ...prev }; delete next[draggableId]; return next; }),
    });
  }, [dealStageMutation]);

  const handleSearch = useCallback(() => { setSearch(searchInput); }, [searchInput]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Kanban className="h-5 w-5 text-emerald-500" />
          <h1 className="text-2xl font-bold tracking-tight">Deal Board</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 w-[200px] pl-8" placeholder="Search..." value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
          </div>
          {search && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setSearchInput(''); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {DEAL_STAGES.slice(0, 5).map(s => (
            <div key={s.key} className="min-w-[280px] space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      ) : pipelineLeads.length === 0 ? (
        <EmptyState icon={Kanban} title="Deal Board is empty" description="Promote leads to see them here." />
      ) : (
        <div className="flex flex-col h-[calc(100vh-12rem)]">
          <ScrollArea className="flex-1 min-h-0 w-full">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-4 pb-4" style={{ minWidth: `${DEAL_STAGES.length * 296}px` }}>
                {DEAL_STAGES.map((stage) => (
                  <Droppable key={stage.key} droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-w-[280px] max-w-[280px] rounded-lg border p-2 ${snapshot.isDraggingOver ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}`}
                      >
                        <div className={`flex items-center justify-between rounded-md px-2 py-1.5 mb-2 ${stage.color}`}>
                          <span className="text-xs font-semibold">{stage.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {(columns[stage.key] ?? []).length}
                          </span>
                        </div>
                        <div className="space-y-2 min-h-[50px]">
                          {(columns[stage.key] ?? []).map((lead, idx) => (
                            <Draggable key={lead.leadInstanceId} draggableId={lead.leadInstanceId} index={idx}>
                              {(prov) => (
                                <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                                  <LeadCard lead={lead} onClick={() => setSelectedLead(lead)} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </DragDropContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      <PropertyDetailSheet lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
