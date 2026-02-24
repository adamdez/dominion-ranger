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
      <div className="flex gap-3 overflow-x-auto pb-4">
        {DEAL_STAGES.map(s => (
          <div key={s.key} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
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
    <div className="h-[calc(100vh-7rem)]">
      <ScrollArea className="h-full w-full">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-0 pb-4 min-w-max">
            {DEAL_STAGES.map((stage, stageIdx) => {
              const cards = columns[stage.key] ?? [];
              return (
                <div
                  key={stage.key}
                  className={`w-64 shrink-0 flex flex-col ${stageIdx > 0 ? 'border-l border-border' : ''}`}
                >
                  <div className="px-3 py-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stage.label}</h3>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {cards.length}
                    </span>
                  </div>
                  <Droppable droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 px-2 pb-2 space-y-1.5 min-h-[120px] transition-colors ${
                          snapshot.isDraggingOver ? 'bg-white/[0.02]' : ''
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
                                className={dragSnapshot.isDragging ? 'opacity-80' : ''}
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
