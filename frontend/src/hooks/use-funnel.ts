import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PaginatedResponse, FunnelLead, FunnelStats } from '@/lib/types';
import { toast } from 'sonner';

export function useFunnelLeads(stage: string, params: {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
} = {}) {
  return useQuery({
    queryKey: ['funnel', stage, params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.page) sp.set('page', String(params.page));
      if (params.pageSize) sp.set('pageSize', String(params.pageSize));
      if (params.search) sp.set('search', params.search);
      if (params.sort) sp.set('sort', params.sort);
      if (params.order) sp.set('order', params.order);
      const { data } = await api.get<PaginatedResponse<FunnelLead>>(
        `/api/funnel/leads/${stage}?${sp}`,
      );
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useFunnelStats() {
  return useQuery({
    queryKey: ['funnelStats'],
    queryFn: async () => {
      const { data } = await api.get<FunnelStats>('/api/funnel/stats');
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useFunnelAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      leadInstanceId: string;
      targetStage: string;
      offerAmountCents?: number;
      notes?: string;
    }) => {
      const { data } = await api.post('/api/funnel/advance', body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funnel'] });
      qc.invalidateQueries({ queryKey: ['funnelStats'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to advance';
      toast.error(msg);
    },
  });
}

export function useFunnelDecline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { leadInstanceId: string; notes?: string }) => {
      const { data } = await api.post('/api/funnel/decline', body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funnel'] });
      qc.invalidateQueries({ queryKey: ['funnelStats'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to decline';
      toast.error(msg);
    },
  });
}
