import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PaginatedResponse, LeadWithProperty, DispositionResponse } from '@/lib/types';
import { toast } from 'sonner';

export function useDialQueue(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['dialQueue', page, pageSize],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<LeadWithProperty>>(
        `/api/dial-queue?page=${page}&pageSize=${pageSize}`
      );
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useDispositions(leadInstanceId: string | null) {
  return useQuery({
    queryKey: ['dispositions', leadInstanceId],
    queryFn: async () => {
      const { data } = await api.get<DispositionResponse[]>(
        `/api/leads/${leadInstanceId}/dispositions`
      );
      return data;
    },
    enabled: !!leadInstanceId,
  });
}

export function useLogDisposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      leadInstanceId: string;
      disposition: string;
      notes?: string;
    }) => {
      const { data } = await api.post<DispositionResponse>(
        `/api/leads/${params.leadInstanceId}/dispositions`,
        { disposition: params.disposition, notes: params.notes }
      );
      return data;
    },
    onSuccess: () => {
      toast.success('Disposition logged');
      queryClient.invalidateQueries({ queryKey: ['dialQueue'] });
      queryClient.invalidateQueries({ queryKey: ['dispositions'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: () => {
      toast.error('Failed to log disposition');
    },
  });
}
