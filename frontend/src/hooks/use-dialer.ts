'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import type {
  DialerStatusResponse,
  DialerTokenResponse,
  CallInitiateResponse,
  SmsResult,
  ConversationResponse,
} from '@/lib/types';

export function useDialerStatus() {
  return useQuery({
    queryKey: ['dialerStatus'],
    queryFn: async () => {
      const { data } = await api.get<DialerStatusResponse>('/api/dialer/status-check');
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useDialerToken() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.get<DialerTokenResponse>('/api/dialer/token');
      return data;
    },
    onError: () => {
      toast.error('Failed to get dialer token');
    },
  });
}

export function useInitiateCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { dominionLeadId: string; leadInstanceId?: string }) => {
      const { data } = await api.post<CallInitiateResponse>('/api/dialer/call', params);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: () => {
      toast.error('Failed to initiate call');
    },
  });
}

export function useHangupCall() {
  return useMutation({
    mutationFn: async (callSid: string) => {
      const { data } = await api.post('/api/dialer/hangup', { callSid });
      return data;
    },
  });
}

export function useSendSms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      dominionLeadId?: string;
      leadInstanceId?: string;
      toPhone: string;
      body: string;
    }) => {
      const { data } = await api.post<SmsResult>('/api/sms/send', params);
      return data;
    },
    onSuccess: () => {
      toast.success('SMS sent');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send SMS';
      toast.error(msg);
    },
  });
}

export function useMessages(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['messages', dominionLeadId],
    queryFn: async () => {
      const { data } = await api.get<ConversationResponse>(
        `/api/leads/${dominionLeadId}/messages`,
      );
      return data;
    },
    enabled: !!dominionLeadId,
    refetchInterval: 15_000,
  });
}
