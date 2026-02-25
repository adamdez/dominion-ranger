import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface MyStats {
  dialsToday: number;
  dialsThisWeek: number;
  myLeads: number;
  myActiveOffers: number;
}

interface AgentPerformance {
  userId: string;
  name: string;
  role: string;
  leadCount: number;
  dialsThisWeek: number;
}

export function useMyStats() {
  return useQuery({
    queryKey: ['dashboard', 'my-stats'],
    queryFn: async () => {
      const { data } = await api.get<MyStats>('/api/dashboard/my-stats');
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useAgentPerformance() {
  return useQuery({
    queryKey: ['dashboard', 'agent-performance'],
    queryFn: async () => {
      const { data } = await api.get<{ agents: AgentPerformance[] }>('/api/dashboard/agent-performance');
      return data.agents;
    },
    refetchInterval: 60_000,
  });
}
