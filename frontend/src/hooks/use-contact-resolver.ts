'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

interface ResolveContactsResponse {
  dominionLeadId: string;
  tier: string;
  contacts: Array<{
    contactName: string | null;
    contactType: string;
    phone: string | null;
    phoneType: string | null;
    email: string | null;
    source: string;
    confidence: string;
    isPrimary: boolean;
    isNew: boolean;
  }>;
  newContactsAdded: number;
  primaryPhone: string | null;
  costCents: number;
  errors: string[];
}

interface BulkResolveResponse {
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
}

export function useResolveContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      dominionLeadId: string;
      tier: 'free' | 'basic' | 'deep';
    }) => {
      const { data } = await api.post<ResolveContactsResponse>(
        `/api/properties/${params.dominionLeadId}/resolve-contacts`,
        { tier: params.tier },
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.newContactsAdded > 0) {
        toast.success(
          `Found ${data.newContactsAdded} new contact${data.newContactsAdded !== 1 ? 's' : ''}` +
          (data.costCents > 0 ? ` ($${(data.costCents / 100).toFixed(2)})` : ''),
        );
      } else if (data.contacts.length > 0) {
        toast.info('No new contacts found — existing data is current');
      } else {
        toast.warning('No contacts found');
      }
      queryClient.invalidateQueries({ queryKey: ['property-contacts', data.dominionLeadId] });
      queryClient.invalidateQueries({ queryKey: ['property-detail', data.dominionLeadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dialQueue'] });
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: () => {
      toast.error('Contact resolution failed');
    },
  });
}

export function useBulkResolveContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      dominionLeadIds: string[];
      tier: 'free' | 'basic' | 'deep';
    }) => {
      const { data } = await api.post<BulkResolveResponse>(
        '/api/contacts/bulk-resolve',
        { dominionLeadIds: params.dominionLeadIds, tier: params.tier },
      );
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Skip traced ${data.succeeded}/${data.total} properties — ${data.totalNewContacts} contacts found` +
        ` ($${(data.totalCostCents / 100).toFixed(2)})`,
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

export function useAddManualContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      dominionLeadId: string;
      contactName?: string;
      contactType?: string;
      phone?: string;
      email?: string;
      notes?: string;
      isPrimary?: boolean;
    }) => {
      const { dominionLeadId, ...body } = params;
      const { data } = await api.post(
        `/api/properties/${dominionLeadId}/contacts`,
        body,
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      toast.success('Contact added');
      queryClient.invalidateQueries({ queryKey: ['property-contacts', variables.dominionLeadId] });
      queryClient.invalidateQueries({ queryKey: ['property-detail', variables.dominionLeadId] });
    },
    onError: () => {
      toast.error('Failed to add contact');
    },
  });
}
