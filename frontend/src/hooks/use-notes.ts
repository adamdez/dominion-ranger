import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

export interface NoteEntry {
  activityId: string;
  text: string;
  createdBy: string | null;
  createdAt: string;
}

export function useLeadNotes(leadInstanceId: string | null) {
  return useQuery({
    queryKey: ['lead-notes', leadInstanceId],
    queryFn: async (): Promise<NoteEntry[]> => {
      const { data } = await api.get<NoteEntry[]>(
        `/api/leads/${leadInstanceId}/notes`,
      );
      return data;
    },
    enabled: !!leadInstanceId,
  });
}

export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { leadInstanceId: string; text: string }) => {
      const { data } = await api.post(
        `/api/leads/${params.leadInstanceId}/notes`,
        { text: params.text },
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', variables.leadInstanceId] });
      queryClient.invalidateQueries({ queryKey: ['leadAudit'] });
      toast.success('Note added');
    },
    onError: () => {
      toast.error('Failed to add note');
    },
  });
}
