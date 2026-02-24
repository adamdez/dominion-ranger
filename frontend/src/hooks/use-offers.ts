import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import type { Offer } from '@/lib/types';

export function useOffers(params: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  dominionLeadId?: string;
} = {}) {
  return useQuery({
    queryKey: ['offers', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set('status', params.status);
      if (params.search) searchParams.set('search', params.search);
      if (params.page) searchParams.set('page', String(params.page));
      if (params.limit) searchParams.set('limit', String(params.limit));
      if (params.dominionLeadId) searchParams.set('dominion_lead_id', params.dominionLeadId);
      const { data } = await api.get<{ offers: Offer[]; total: number }>(`/api/offers?${searchParams}`);
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useOffer(offerId: string | null) {
  return useQuery({
    queryKey: ['offer', offerId],
    queryFn: async () => {
      const { data } = await api.get<Offer>(`/api/offers/${offerId}`);
      return data;
    },
    enabled: !!offerId,
  });
}

export function useOfferStats() {
  return useQuery({
    queryKey: ['offer-stats'],
    queryFn: async () => {
      const { data } = await api.get<{ activeCount: number; totalAmountCents: number }>('/api/offers/stats');
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      dominionLeadId: string;
      propertyId: string;
      leadInstanceId?: string;
      offerAmountCents: number;
      earnestMoneyCents?: number;
      closingDays?: number;
      inspectionDays?: number;
      offerExpiryDays?: number;
      contingencies?: string[];
      additionalTerms?: string;
      compReportId?: string;
      arvCents?: number;
      rehabEstimateCents?: number;
      assignmentFeeCents?: number;
      notes?: string;
    }) => {
      const { data } = await api.post<Offer>('/api/offers', params);
      return data;
    },
    onSuccess: () => {
      toast.success('Offer created');
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
    },
    onError: () => toast.error('Failed to create offer'),
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: { id: string } & Record<string, unknown>) => {
      const { data } = await api.patch<Offer>(`/api/offers/${id}`, params);
      return data;
    },
    onSuccess: () => {
      toast.success('Offer updated');
      queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
    onError: () => toast.error('Failed to update offer'),
  });
}

export function useSendOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const { data } = await api.post<Offer>(`/api/offers/${offerId}/send`);
      return data;
    },
    onSuccess: () => {
      toast.success('Offer sent and PDF generated');
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
    },
    onError: () => toast.error('Failed to send offer'),
  });
}

export function useRespondOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      offerId: string;
      status: 'accepted' | 'rejected' | 'countered' | 'withdrawn';
      counterAmountCents?: number;
      counterNotes?: string;
      notes?: string;
    }) => {
      const { offerId, ...body } = params;
      const { data } = await api.post<Offer>(`/api/offers/${offerId}/respond`, body);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Offer ${data.status}`);
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
    },
    onError: () => toast.error('Failed to record response'),
  });
}

export function useDeleteOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      await api.delete(`/api/offers/${offerId}`);
    },
    onSuccess: () => {
      toast.success('Offer deleted');
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
    },
    onError: () => toast.error('Failed to delete offer'),
  });
}
