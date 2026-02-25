'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { PropertyDetail, DistressEvent, Task, Tag } from '@/lib/types';

export interface PropertyContact {
  contactId: string;
  fullName: string | null;
  contactType: string;
  phone: string | null;
  phoneType: string | null;
  phoneStatus: string | null;
  email: string | null;
  isPrimary: boolean | null;
  dndCalls: boolean | null;
  dndSms: boolean | null;
  source: string | null;
}

export interface TimelineItem {
  type: 'call' | 'sms' | 'disposition' | 'status_change';
  summary: string;
  notes: string | null;
  timestamp: string;
  userId: string | null;
}

export function usePropertyDetail(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-detail', dominionLeadId],
    queryFn: async (): Promise<PropertyDetail | null> => {
      try {
        const { data } = await api.get<{ property: PropertyDetail } | PropertyDetail>(
          `/api/properties/${dominionLeadId}/detail`,
        );
        return (data && typeof data === 'object' && 'property' in data)
          ? (data.property as PropertyDetail)
          : (data as PropertyDetail);
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
        const { data } = await api.get<{ events: DistressEvent[]; count: number } | DistressEvent[]>(
          `/api/properties/${dominionLeadId}/events`,
        );
        return Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
      } catch {
        return [];
      }
    },
    enabled: !!dominionLeadId,
  });
}

export function usePropertyContacts(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-contacts', dominionLeadId],
    queryFn: async (): Promise<PropertyContact[]> => {
      try {
        const { data } = await api.get<PropertyContact[]>(
          `/api/properties/${dominionLeadId}/contacts`,
        );
        return data;
      } catch {
        return [];
      }
    },
    enabled: !!dominionLeadId,
  });
}

export function useLeadHistory(leadInstanceId: string | null) {
  return useQuery({
    queryKey: ['lead-history', leadInstanceId],
    queryFn: async (): Promise<TimelineItem[]> => {
      try {
        const { data } = await api.get<TimelineItem[]>(
          `/api/leads/${leadInstanceId}/history`,
        );
        return data;
      } catch {
        return [];
      }
    },
    enabled: !!leadInstanceId,
  });
}

export function usePropertyTasks(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-tasks', dominionLeadId],
    queryFn: async (): Promise<Task[]> => {
      try {
        const { data } = await api.get('/api/tasks', {
          params: { dominionLeadId },
        });
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.data)) return data.data;
        if (Array.isArray(data?.tasks)) return data.tasks;
        return [];
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
