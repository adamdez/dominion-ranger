'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PropertyDetail, DistressEvent, Task, Tag } from '@/lib/types';

export function usePropertyDetail(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-detail', dominionLeadId],
    queryFn: async (): Promise<PropertyDetail | null> => {
      // TODO: wire to GET /api/properties/:id/detail when phase-3/backend-intelligence merges
      try {
        const { data } = await api.get<PropertyDetail>(`/api/properties/${dominionLeadId}/detail`);
        return data;
      } catch {
        return null;
      }
    },
    enabled: !!dominionLeadId,
  });
}

export function usePropertyEvents(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-events', dominionLeadId],
    queryFn: async (): Promise<DistressEvent[]> => {
      try {
        const { data } = await api.get<DistressEvent[]>(
          `/api/properties/${dominionLeadId}/events`,
        );
        return data;
      } catch {
        return [];
      }
    },
    enabled: !!dominionLeadId,
  });
}

export function usePropertyTasks(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-tasks', dominionLeadId],
    queryFn: async (): Promise<Task[]> => {
      // TODO: wire to GET /api/tasks?dominionLeadId=... when backend merges
      try {
        const { data } = await api.get<Task[]>('/api/tasks', {
          params: { dominionLeadId },
        });
        return data;
      } catch {
        return [];
      }
    },
    enabled: !!dominionLeadId,
  });
}

export function usePropertyTags(leadInstanceId: string | null) {
  return useQuery({
    queryKey: ['property-tags', leadInstanceId],
    queryFn: async (): Promise<Tag[]> => {
      // TODO: wire to GET /api/leads/:id/tags when backend merges
      try {
        const { data } = await api.get<Tag[]>(`/api/leads/${leadInstanceId}/tags`);
        return data;
      } catch {
        return [];
      }
    },
    enabled: !!leadInstanceId,
  });
}
