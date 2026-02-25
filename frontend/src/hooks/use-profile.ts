import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

interface UserProfile {
  userId: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  stats: {
    totalLeads: number;
    totalDials: number;
    totalOffers: number;
  };
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await api.get<UserProfile>('/api/users/me');
      return data;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { firstName?: string; lastName?: string; phone?: string | null }) => {
      const { data } = await api.patch('/api/users/me', body);
      return data;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => toast.error('Failed to update profile'),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const { data } = await api.post('/api/users/me/password', body);
      return data;
    },
    onSuccess: () => toast.success('Password changed successfully'),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to change password';
      toast.error(msg);
    },
  });
}
