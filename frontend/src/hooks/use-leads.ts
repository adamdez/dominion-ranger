import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PaginatedResponse, LeadWithProperty, LeadInstanceResponse, AuditLogEntry } from '@/lib/types';
import { toast } from 'sonner';

export function useLeads(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  county?: string;
  minScore?: number;
  maxScore?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  view?: 'all' | 'mine' | 'unassigned';
} = {}) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', String(params.page));
      if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
      if (params.status) searchParams.set('status', params.status);
      if (params.county) searchParams.set('county', params.county);
      if (params.minScore) searchParams.set('minScore', String(params.minScore));
      if (params.maxScore) searchParams.set('maxScore', String(params.maxScore));
      if (params.search) searchParams.set('search', params.search);
      if (params.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
      if (params.view && params.view !== 'all') searchParams.set('view', params.view);

      const { data } = await api.get<PaginatedResponse<LeadWithProperty>>(
        `/api/leads?${searchParams}`
      );
      return data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useLeadInstance(leadInstanceId: string | null) {
  return useQuery({
    queryKey: ['lead', leadInstanceId],
    queryFn: async () => {
      const { data } = await api.get<LeadWithProperty>(
        `/api/leads/${leadInstanceId}`
      );
      return data;
    },
    enabled: !!leadInstanceId,
  });
}

export function useLeadAudit(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['leadAudit', dominionLeadId],
    queryFn: async () => {
      const { data } = await api.get<AuditLogEntry[]>(
        `/api/properties/${dominionLeadId}/audit`
      );
      return data;
    },
    enabled: !!dominionLeadId,
  });
}

export function useClaimLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { leadInstanceId: string; expectedVersion: number }) => {
      const { data } = await api.post<LeadInstanceResponse>(
        `/api/leads/${params.leadInstanceId}/claim`,
        { expectedVersion: params.expectedVersion }
      );
      return data;
    },
    onSuccess: () => {
      toast.success('Lead claimed successfully');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['funnel'] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (error: { response?: { status: number; data?: { message?: string } } }) => {
      const msg = error.response?.data?.message;
      if (error.response?.status === 409 || (msg && msg.includes('already claimed'))) {
        toast.error('Lead already claimed by another user');
      } else {
        toast.error(msg ?? 'Failed to claim lead');
      }
    },
  });
}

export function useTransitionLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      leadInstanceId: string;
      toStatus: string;
      expectedVersion: number;
      notes?: string;
    }) => {
      const { data } = await api.post<LeadInstanceResponse>(
        `/api/leads/${params.leadInstanceId}/transition`,
        {
          toStatus: params.toStatus,
          expectedVersion: params.expectedVersion,
          notes: params.notes,
        }
      );
      return data;
    },
    onSuccess: () => {
      toast.success('Lead status updated');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['dialQueue'] });
    },
    onError: (error: { response?: { status: number; data?: { message?: string } } }) => {
      if (error.response?.status === 409) {
        toast.error('Concurrency conflict — please refresh and try again');
      } else {
        toast.error(error.response?.data?.message ?? 'Failed to update lead status');
      }
    },
  });
}

export function useRunCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadInstanceId: string) => {
      const { data } = await api.post<LeadInstanceResponse>(
        `/api/leads/${leadInstanceId}/compliance`
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.complianceCleared) {
        toast.success('Compliance cleared — lead is dial-ready');
      } else {
        toast.error('Lead blocked by compliance check');
      }
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
    },
    onError: () => {
      toast.error('Compliance check failed');
    },
  });
}
