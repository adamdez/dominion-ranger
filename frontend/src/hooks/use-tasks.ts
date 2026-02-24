'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Task } from '@/lib/types';
import { toast } from 'sonner';

interface TaskViewResponse {
  tasks: Task[];
  stats: TaskStats;
}

export interface TaskStats {
  overdue: number;
  todayPending: number;
  totalPending: number;
  completedToday: number;
}

export function useTaskView(view: 'today' | 'overdue' | 'upcoming' | 'completed') {
  return useQuery({
    queryKey: ['tasks', 'view', view],
    queryFn: async (): Promise<TaskViewResponse> => {
      try {
        const { data } = await api.get<TaskViewResponse>(`/api/tasks/view/${view}`);
        return data;
      } catch {
        return { tasks: [], stats: { overdue: 0, todayPending: 0, totalPending: 0, completedToday: 0 } };
      }
    },
    refetchInterval: 30_000,
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: ['tasks', 'stats'],
    queryFn: async (): Promise<TaskStats> => {
      try {
        const { data } = await api.get<TaskStats>('/api/tasks/stats');
        return data;
      } catch {
        return { overdue: 0, todayPending: 0, totalPending: 0, completedToday: 0 };
      }
    },
    refetchInterval: 30_000,
  });
}

export function useTasksDueToday() {
  return useQuery({
    queryKey: ['tasks', 'dueToday'],
    queryFn: async (): Promise<Task[]> => {
      try {
        const { data } = await api.get<Task[]>('/api/tasks/due-today');
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
      try {
        const { data } = await api.get<Task[]>('/api/tasks/overdue');
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
      priority?: string;
    }) => {
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

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      toast.success('Task cancelled');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Failed to cancel task');
    },
  });
}
