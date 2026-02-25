'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface NotificationEntry {
  notificationId: string;
  userId: string | null;
  title: string;
  body: string | null;
  type: string;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationEntry[]>('/api/notifications');
      return data;
    },
    refetchInterval: 60_000,
  });
}
