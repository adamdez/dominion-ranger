'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

export interface FeatureFlag {
  flagKey: string;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ErrorLogEntry {
  errorId: string;
  errorType: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  resolved: boolean;
  createdAt: string;
}

export interface DeepHealthCheck {
  status: 'healthy' | 'degraded';
  counts: {
    properties: number;
    events: number;
    scores: number;
    leads: number;
    active_configs: number;
    accumulations: number;
  };
  issues: string[];
  timestamp: string;
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['featureFlags'],
    queryFn: async () => {
      const { data } = await api.get<FeatureFlag[]>('/api/settings/flags');
      return data;
    },
  });
}

export function useToggleFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      const { data } = await api.patch(`/api/settings/flags/${flagKey}`, { enabled });
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(`${variables.flagKey} ${variables.enabled ? 'enabled' : 'disabled'}`);
      queryClient.invalidateQueries({ queryKey: ['featureFlags'] });
    },
    onError: () => {
      toast.error('Failed to update feature flag');
    },
  });
}

export function useRecentErrors() {
  return useQuery({
    queryKey: ['recentErrors'],
    queryFn: async () => {
      const { data } = await api.get<ErrorLogEntry[]>('/api/settings/errors');
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useDeepHealth() {
  return useQuery({
    queryKey: ['deepHealth'],
    queryFn: async () => {
      const { data } = await api.get<DeepHealthCheck>('/api/health/deep');
      return data;
    },
  });
}
