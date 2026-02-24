import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

export function useBulkAssign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { leadInstanceIds: string[]; assignedTo: string }) => {
      const { data } = await api.patch<{ updated: number }>(
        '/api/leads/bulk-assign',
        params,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: () => {
      toast.error('Bulk assign failed');
    },
  });
}

export function useBulkSkipTrace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { dominionLeadIds: string[] }) => {
      const { data } = await api.post<{ enqueued: number }>(
        '/api/skip-trace/bulk-enqueue',
        params,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: () => {
      toast.error('Bulk skip trace failed');
    },
  });
}
