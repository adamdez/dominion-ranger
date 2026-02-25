import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface Agent {
  userId: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data } = await api.get<{ agents: Agent[] }>('/api/users/agents');
      return data.agents;
    },
    staleTime: 5 * 60 * 1000,
  });
}
