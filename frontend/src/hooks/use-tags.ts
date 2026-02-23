'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Tag } from '@/lib/types';
import { toast } from 'sonner';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async (): Promise<Tag[]> => {
      // TODO: wire to GET /api/tags when phase-3/backend-intelligence merges
      try {
        const { data } = await api.get<Tag[]>('/api/tags');
        return data;
      } catch {
        return [];
      }
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; color: string }) => {
      // TODO: wire to POST /api/tags when backend merges
      const { data } = await api.post<Tag>('/api/tags', params);
      return data;
    },
    onSuccess: () => {
      toast.success('Tag created');
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      toast.error('Failed to create tag');
    },
  });
}

export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadInstanceId, tagId }: { leadInstanceId: string; tagId: string }) => {
      // TODO: wire to POST /api/leads/:id/tags when backend merges
      return api.post(`/api/leads/${leadInstanceId}/tags`, { tagId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['property-detail'] });
    },
    onError: () => {
      toast.error('Failed to add tag');
    },
  });
}

export function useRemoveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadInstanceId, tagId }: { leadInstanceId: string; tagId: string }) => {
      // TODO: wire to DELETE /api/leads/:id/tags/:tagId when backend merges
      return api.delete(`/api/leads/${leadInstanceId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['property-detail'] });
    },
    onError: () => {
      toast.error('Failed to remove tag');
    },
  });
}
