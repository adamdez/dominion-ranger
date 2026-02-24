import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PaginatedResponse, Prospect, PromoteResult } from '@/lib/types';
import { toast } from 'sonner';

export function useProspects(params: {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  tier?: string;
  county?: string;
  search?: string;
} = {}) {
  return useQuery({
    queryKey: ['prospects', params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.page) sp.set('page', String(params.page));
      if (params.limit) sp.set('limit', String(params.limit));
      if (params.sort) sp.set('sort', params.sort);
      if (params.order) sp.set('order', params.order);
      if (params.tier && params.tier !== 'all') sp.set('tier', params.tier);
      if (params.county) sp.set('county', params.county);
      if (params.search) sp.set('search', params.search);

      const { data } = await api.get<PaginatedResponse<Prospect>>(
        `/api/prospects?${sp}`,
      );
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useCounties() {
  return useQuery({
    queryKey: ['prospects', 'counties'],
    queryFn: async () => {
      const { data } = await api.get<string[]>('/api/prospects/counties');
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function usePromoteProperties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (propertyIds: string[]) => {
      const { data } = await api.post<PromoteResult>(
        '/api/prospects/promote',
        { propertyIds },
      );
      return data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      qc.invalidateQueries({ queryKey: ['systemStats'] });

      const parts: string[] = [];
      if (result.promoted > 0) parts.push(`${result.promoted} promoted`);
      if (result.skipped > 0) parts.push(`${result.skipped} already in pipeline`);
      if (result.errors > 0) parts.push(`${result.errors} errors`);
      toast.success(parts.join(', '));
    },
    onError: () => {
      toast.error('Failed to promote properties');
    },
  });
}
