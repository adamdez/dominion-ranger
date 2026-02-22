import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ScoringStatsResponse, ScoreResponse } from '@/lib/types';
import { toast } from 'sonner';

export function useScoringStats() {
  return useQuery({
    queryKey: ['scoringStats'],
    queryFn: async () => {
      const { data } = await api.get<ScoringStatsResponse>('/api/scoring/stats');
      return data;
    },
  });
}

export function usePropertyScore(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['score', dominionLeadId],
    queryFn: async () => {
      const { data } = await api.get<ScoreResponse>(
        `/api/scoring/${dominionLeadId}`
      );
      return data;
    },
    enabled: !!dominionLeadId,
  });
}

export function useScoreHistory(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['scoreHistory', dominionLeadId],
    queryFn: async () => {
      const { data } = await api.get<ScoreResponse[]>(
        `/api/scoring/${dominionLeadId}/history`
      );
      return data;
    },
    enabled: !!dominionLeadId,
  });
}

export function useRunScoring() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { limit?: number; county?: string; rescore?: boolean }) => {
      const { data } = await api.post('/api/scoring/run', params ?? {});
      return data;
    },
    onSuccess: () => {
      toast.success('Scoring batch started');
      queryClient.invalidateQueries({ queryKey: ['scoringStats'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: () => {
      toast.error('Failed to start scoring');
    },
  });
}
