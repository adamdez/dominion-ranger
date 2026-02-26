'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PipelineLead, PipelineStats } from '@/lib/types';
import { toast } from 'sonner';
import { DEAL_STAGES } from '@/lib/constants';

// ─── Deal Board / Pipeline Hooks (existing) ─────────────

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
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
      return DEAL_STAGES.map(s => ({ stage: s.key, count: 0, totalValueCents: 0 }));
    },
  });
}

export function useDealStageTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadInstanceId, stage }: { leadInstanceId: string; stage: string }) => {
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

// ─── Pipeline Automation Hooks (new) ─────────────────────

export interface PipelineJobResult {
  job: string;
  success: boolean;
  message: string;
  count?: number;
  errors?: number;
  durationMs: number;
  completedAt: string;
}

export interface PipelineToggles {
  autoImport: boolean;
  autoScoring: boolean;
  autoPromotion: boolean;
  nightlyRescore: boolean;
}

export interface PipelineStatus {
  enabled: boolean;
  toggles: PipelineToggles;
  lastRuns: {
    import: PipelineJobResult | null;
    scoring: PipelineJobResult | null;
    promotion: PipelineJobResult | null;
    rescore: PipelineJobResult | null;
  };
}

export function usePipelineStatus() {
  return useQuery({
    queryKey: ['pipelineStatus'],
    queryFn: async () => {
      const { data } = await api.get<PipelineStatus>('/api/pipeline/status');
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useTogglePipelineEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data } = await api.patch('/api/pipeline/enabled', { enabled });
      return data;
    },
    onSuccess: (_, enabled) => {
      toast.success(`Pipeline automation ${enabled ? 'enabled' : 'disabled'}`);
      qc.invalidateQueries({ queryKey: ['pipelineStatus'] });
    },
    onError: () => toast.error('Failed to update pipeline toggle'),
  });
}

export function useUpdatePipelineToggles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (toggles: Partial<PipelineToggles>) => {
      const { data } = await api.patch('/api/pipeline/toggles', toggles);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelineStatus'] });
    },
    onError: () => toast.error('Failed to update pipeline settings'),
  });
}

export function useRunPipelineJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: 'import' | 'scoring' | 'promotion' | 'rescore') => {
      const endpoint = `/api/system/run-${job}`;
      const { data } = await api.post(endpoint, {});
      return data;
    },
    onSuccess: (_, job) => {
      toast.success(`${job.charAt(0).toUpperCase() + job.slice(1)} job started`);
      qc.invalidateQueries({ queryKey: ['pipelineStatus'] });
    },
    onError: (_, job) => {
      toast.error(`Failed to run ${job} job`);
    },
  });
}

export function useRunAdapter() {
  return useMutation({
    mutationFn: async (adapter: 'regrid' | 'spokane_recorder' | 'kootenai_recorder') => {
      const { data } = await api.post('/api/pipeline/run-adapter', { adapter });
      return data;
    },
    onSuccess: (_, adapter) => {
      toast.success(`${adapter} pipeline started in background`);
    },
    onError: (_, adapter) => {
      toast.error(`Failed to start ${adapter} pipeline`);
    },
  });
}

export function useRunAllRecorders() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/pipeline/run-all-recorders', {});
      return data;
    },
    onSuccess: () => {
      toast.success('County recorders started in background');
    },
    onError: () => {
      toast.error('Failed to start county recorders');
    },
  });
}
