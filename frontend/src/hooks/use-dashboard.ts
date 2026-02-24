import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface LeadStatsResponse {
  total: number;
  active: number;
  dialReady: number;
  promoted: number;
  closedThisMonth: number;
  newLeads24h?: number;
  byStatus: Array<{ status: string; count: number }>;
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['leadStats'],
    queryFn: async () => {
      const { data } = await api.get<LeadStatsResponse>('/api/leads/stats');
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
