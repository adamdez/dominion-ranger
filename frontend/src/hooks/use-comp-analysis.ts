'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

export type CompQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'no_data';

export interface RankedComp {
  address: string;
  salePrice: number;
  saleDate: string;
  sqft: number;
  beds: number;
  baths: number;
  yearBuilt: number;
  distanceMiles: number;
  rank: number;
  score: number;
  sqftDiff: number;
  distanceBucket: string;
}

export interface CompAnalysisResult {
  success: boolean;
  cached: boolean;
  reportId: string;
  subjectSqft: number;
  allComps: Array<{
    address: string;
    salePrice: number;
    saleDate: string;
    sqft: number;
    beds: number;
    baths: number;
    yearBuilt: number;
    distanceMiles: number;
  }>;
  bestThree: RankedComp[];
  arv: number;
  compCount: number;
  quality: CompQuality;
  warning: string | null;
  cachedAt: string;
}

export function useCompAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      dominionLeadId: string;
      forceFresh?: boolean;
      radiusMiles?: number;
      searchMonths?: number;
    }) => {
      const { dominionLeadId, ...body } = params;
      const { data } = await api.post<CompAnalysisResult>(
        `/api/properties/${dominionLeadId}/comps/analyze`,
        body,
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['property-comps'] });
      if (data.cached) {
        toast.info('Using cached comp data (less than 24h old)');
      } else {
        toast.success(`Comp analysis complete — ${data.compCount} comps found`);
      }
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to analyze comps';
      toast.error(message);
    },
  });
}
