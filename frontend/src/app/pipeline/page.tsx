'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { LayoutGrid } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LeadCard } from '@/components/pipeline/lead-card';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { usePipeline, useDealStageTransition } from '@/hooks/use-pipeline';
import { DEAL_STAGES } from '@/lib/constants';
import type { PipelineLead, LeadWithProperty } from '@/lib/types';

export default function PipelinePage() {
  const { data: leads, isLoading, error, refetch } = usePipeline();
  const dealStageTransition = useDealStageTransition();
  const [selectedLead, setSelectedLead] = useState<LeadWithProperty | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  const columns = useMemo(() => {
    if (!leads) return {};
    const grouped: Record<string, PipelineLead[]> = {};
    for (const stage of DEAL_STAGES) {
      grouped[stage.key] = [];
    }
    for (const lead of leads) {
      const stage = optimisticMoves[lead.leadInstanceId] ?? lead.dealStage ?? 'NEW_LEAD';
      if (grouped[stage]) {
        grouped[stage].push(lead);
      } else {
        grouped['NEW_LEAD'].push(lead);
      }
    }
    return grouped;
  }, [leads, optimisticMoves]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const fromStage = result.source.droppableId;
    const toStage = result.destination.droppableId;
    if (fromStage === toStage) return;

    const leadId = result.draggableId;

    setOptimisticMoves(prev => ({ ...prev, [leadId]: toStage }));

    dealStageTransition.mutate(
      { leadInstanceId: leadId, stage: toStage },
      {
        onError: () => {
          setOptimisticMoves(prev => {
            const next = { ...prev };
            delete next[leadId];
            return next;
          });
        },
        onSuccess: () => {
          setOptimisticMoves(prev => {
            const next = { ...prev };
            delete next[leadId];
            return next;
          });
        },
      },
    );
  }, [dealStageTransition]);

  if (error) {
    return <ErrorState message="Failed to load pipeline" onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_STAGES.map(s => (
          <div key={s.key} className="w-72 shrink-0 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Pipeline is empty"
        description="Import properties, run scoring, and promote leads to populate the pipeline."
      />
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ScrollArea className="h-full w-full">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 pb-4 min-w-max px-1">
            {DEAL_STAGES.map(stage => {
              const cards = columns[stage.key] ?? [];
              const totalValue = 0; // TODO: sum from deals.assignment_fee_cents when backend merges
              return (
                <div
                  key={stage.key}
                  className={`w-72 shrink-0 rounded-lg border ${stage.color} flex flex-col`}
                >
                  <div className="p-3 border-b space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{stage.label}</h3>
                      <span className="text-xs font-medium text-muted-foreground rounded-full bg-background px-2 py-0.5">
                        {cards.length}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {totalValue > 0 ? `$${(totalValue / 100_000).toFixed(0)}K` : '$0'}
                    </div>
                  </div>
                  <Droppable droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2 space-y-2 min-h-[120px] transition-colors ${
                          snapshot.isDraggingOver ? 'bg-primary/5' : ''
                        }`}
                      >
                        {cards.map((lead, index) => (
                          <Draggable
                            key={lead.leadInstanceId}
                            draggableId={lead.leadInstanceId}
                            index={index}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={dragSnapshot.isDragging ? 'opacity-90 rotate-1' : ''}
                              >
                                <LeadCard
                                  lead={lead}
                                  onClick={() => setSelectedLead(lead)}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <PropertyDetailSheet
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
