import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PaginatedResponse, PropertyResponse } from '@/lib/types';

export function useProperties(page = 1, pageSize = 25, filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['properties', page, pageSize, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...filters,
      });
      const { data } = await api.get<PaginatedResponse<PropertyResponse>>(
        `/api/properties?${params}`
      );
      return data;
    },
  });
}

export function useProperty(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property', dominionLeadId],
    queryFn: async () => {
      const { data } = await api.get<PropertyResponse>(
        `/api/properties/${dominionLeadId}`
      );
      return data;
    },
    enabled: !!dominionLeadId,
  });
}

export function usePropertyCount() {
  return useQuery({
    queryKey: ['propertyCount'],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>('/api/properties/count');
      return data.count;
    },
  });
}
