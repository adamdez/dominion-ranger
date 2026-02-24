'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PipelineLead, PipelineStats } from '@/lib/types';
import { toast } from 'sonner';
import { DEAL_STAGES } from '@/lib/constants';

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // TODO: wire to backend when phase-3/backend-intelligence merges
      // GET /api/leads?limit=500&includeTags=true&includeDealStage=true
      try {
        const { data } = await api.get<{ data: PipelineLead[] }>('/api/leads', {
          params: { pageSize: 500 },
        });
        const leads = (data as { data?: PipelineLead[] }).data ?? [];
        return leads.map((lead) => ({
          ...lead,
          dealStage: lead.dealStage ?? mapStatusToDealStage(lead.status),
          tags: lead.tags ?? [],
        }));
      } catch {
        return [];
      }
    },
  });
}

export function usePipelineStats() {
  return useQuery({
    queryKey: ['pipelineStats'],
    queryFn: async (): Promise<PipelineStats[]> => {
      // TODO: wire to GET /api/pipeline/stats when backend merges
      return DEAL_STAGES.map(s => ({ stage: s.key, count: 0, totalValueCents: 0 }));
    },
  });
}

export function useDealStageTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadInstanceId, stage }: { leadInstanceId: string; stage: string }) => {
      // TODO: wire to PATCH /api/leads/:leadInstanceId/deal-stage when backend merges
      const { data } = await api.patch(`/api/leads/${leadInstanceId}/deal-stage`, { stage });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipelineStats'] });
    },
    onError: () => {
      toast.error('Failed to update deal stage');
    },
  });
}

/**
 * Map existing lead statuses to deal stages for backward compatibility
 * until the backend explicitly stores deal_stage.
 */
function mapStatusToDealStage(status: string): string {
  const mapping: Record<string, string> = {
    PROMOTED: 'NEW_LEAD',
    ASSIGNED: 'NEW_LEAD',
    COMPLIANCE_PENDING: 'NEW_LEAD',
    DIAL_READY: 'NEW_LEAD',
    DIALING: 'CONTACTED',
    CONTACTED: 'CONTACTED',
    OFFER_SENT: 'OFFER_MADE',
    CONTRACTED: 'UNDER_CONTRACT',
    CLOSED: 'CLOSED_WON',
    DEAD: 'CLOSED_LOST',
  };
  return mapping[status] ?? 'NEW_LEAD';
}
