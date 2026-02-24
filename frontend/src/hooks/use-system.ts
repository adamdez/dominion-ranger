import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { SystemStatsResponse } from '@/lib/types';

export function useSystemStats() {
  return useQuery({
    queryKey: ['systemStats'],
    queryFn: async () => {
      const { data } = await api.get<SystemStatsResponse>('/api/system/stats');
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
