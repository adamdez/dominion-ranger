'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Task } from '@/lib/types';
import { toast } from 'sonner';

export function useTasks(filters?: { status?: string; assignedTo?: string; leadInstanceId?: string }) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async (): Promise<Task[]> => {
      // TODO: wire to GET /api/tasks when phase-3/backend-intelligence merges
      try {
        const { data } = await api.get<Task[]>('/api/tasks', { params: filters });
        return data;
      } catch {
        return [];
      }
    },
  });
}

export function useTasksDueToday() {
  return useQuery({
    queryKey: ['tasks', 'dueToday'],
    queryFn: async (): Promise<Task[]> => {
      // TODO: wire to GET /api/tasks?dueToday=true when backend merges
      try {
        const { data } = await api.get<Task[]>('/api/tasks', { params: { dueToday: 'true' } });
        return data;
      } catch {
        return [];
      }
    },
  });
}

export function useOverdueTasks() {
  return useQuery({
    queryKey: ['tasks', 'overdue'],
    queryFn: async (): Promise<Task[]> => {
      // TODO: wire to GET /api/tasks?overdue=true when backend merges
      try {
        const { data } = await api.get<Task[]>('/api/tasks', { params: { overdue: 'true' } });
        return data;
      } catch {
        return [];
      }
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string;
      taskType: string;
      dueAt?: string;
      assignedTo?: string;
      dominionLeadId?: string;
      leadInstanceId?: string;
    }) => {
      // TODO: wire to POST /api/tasks when backend merges
      const { data } = await api.post<Task>('/api/tasks', params);
      return data;
    },
    onSuccess: () => {
      toast.success('Task created');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      // TODO: wire to PATCH /api/tasks/:id/complete when backend merges
      const { data } = await api.patch<Task>(`/api/tasks/${taskId}/complete`);
      return data;
    },
    onSuccess: () => {
      toast.success('Task completed');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Failed to complete task');
    },
  });
}
