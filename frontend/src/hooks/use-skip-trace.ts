import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { SkipTraceResponse } from '@/lib/types';
import { toast } from 'sonner';

export function useSkipTrace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      dominionLeadId: string;
      tier: 'STANDARD' | 'ADVANCED';
    }) => {
      const { data } = await api.post<SkipTraceResponse>(
        `/api/leads/${params.dominionLeadId}/skip-trace`,
        { tier: params.tier },
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        const phones = [data.phone, ...data.additionalPhones].filter(Boolean).length;
        toast.success(
          `Skip trace complete — ${phones} phone${phones !== 1 ? 's' : ''} found` +
          (data.email ? ', email found' : '') +
          ` ($${(data.costCents / 100).toFixed(2)})`,
        );
      } else {
        toast.warning(data.error ?? 'Skip trace returned no results');
      }
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['dialQueue'] });
    },
    onError: () => {
      toast.error('Skip trace failed — check logs');
    },
  });
}
