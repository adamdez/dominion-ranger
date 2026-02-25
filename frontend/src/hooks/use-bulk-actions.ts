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
    mutationFn: async (params: { dominionLeadIds: string[]; tier?: 'free' | 'basic' | 'deep' }) => {
      const { data } = await api.post<{
        total: number;
        succeeded: number;
        failed: number;
        totalNewContacts: number;
        totalCostCents: number;
        results: Array<{
          dominionLeadId: string;
          success: boolean;
          newContacts: number;
          primaryPhone: string | null;
          costCents: number;
          error?: string;
        }>;
      }>(
        '/api/contacts/bulk-resolve',
        { dominionLeadIds: params.dominionLeadIds, tier: params.tier ?? 'basic' },
      );
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Skip traced ${data.succeeded}/${data.total} — ${data.totalNewContacts} contacts found ($${(data.totalCostCents / 100).toFixed(2)})`,
      );
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dialQueue'] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: () => {
      toast.error('Bulk skip trace failed');
    },
  });
}
