'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { SavedFilter } from '@/lib/types';
import { toast } from 'sonner';

export function useSavedFilters() {
  return useQuery({
    queryKey: ['savedFilters'],
    queryFn: async (): Promise<SavedFilter[]> => {
      // TODO: wire to GET /api/saved-filters when phase-3/backend-intelligence merges
      try {
        const { data } = await api.get<SavedFilter[]>('/api/saved-filters');
        return data;
      } catch {
        return [];
      }
    },
  });
}

export function useCreateSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; filterConfig: Record<string, unknown> }) => {
      // TODO: wire to POST /api/saved-filters when backend merges
      const { data } = await api.post<SavedFilter>('/api/saved-filters', params);
      return data;
    },
    onSuccess: () => {
      toast.success('Filter saved');
      queryClient.invalidateQueries({ queryKey: ['savedFilters'] });
    },
    onError: () => {
      toast.error('Failed to save filter');
    },
  });
}

export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (filterId: string) => {
      // TODO: wire to DELETE /api/saved-filters/:id when backend merges
      return api.delete(`/api/saved-filters/${filterId}`);
    },
    onSuccess: () => {
      toast.success('Filter deleted');
      queryClient.invalidateQueries({ queryKey: ['savedFilters'] });
    },
    onError: () => {
      toast.error('Failed to delete filter');
    },
  });
}
