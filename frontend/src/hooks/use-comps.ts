'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

export interface CompEntry {
  address: string;
  city: string;
  state: string;
  zip: string;
  saleDate: string;
  salePriceCents: number;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  distanceMiles: number;
  pricePerSqftCents: number;
  propertyType: string;
  daysOnMarket: number | null;
}

export interface CompReport {
  id: string;
  dominionLeadId: string;
  subjectAddress: string;
  subjectCity: string | null;
  subjectState: string | null;
  subjectZip: string | null;
  subjectBeds: number | null;
  subjectBaths: string | null;
  subjectSqft: number | null;
  subjectLotSqft: number | null;
  subjectYearBuilt: number | null;
  subjectPropertyType: string | null;
  estimatedValueCents: number | null;
  estimatedValueLowCents: number | null;
  estimatedValueHighCents: number | null;
  confidenceScore: string | null;
  comps: CompEntry[];
  compCount: number;
  avgPricePerSqftCents: number | null;
  medianSalePriceCents: number | null;
  arvCents: number | null;
  maxOfferCents: number | null;
  rehabEstimateCents: number | null;
  assignmentFeeCents: number | null;
  searchRadiusMiles: string | null;
  searchMonths: number | null;
  batchdataRequestId: string | null;
  generatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompReportsResponse {
  reports: CompReport[];
}

interface GenerateCompResponse {
  success: boolean;
  cached: boolean;
  report: CompReport;
}

export function usePropertyCompReports(dominionLeadId: string | null) {
  return useQuery({
    queryKey: ['property-comps', dominionLeadId],
    queryFn: async (): Promise<CompReport[]> => {
      try {
        const { data } = await api.get<CompReportsResponse>(
          `/api/comps/property/${dominionLeadId}`,
        );
        return data.reports;
      } catch {
        return [];
      }
    },
    enabled: !!dominionLeadId,
  });
}

export function useGenerateCompReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      dominionLeadId: string;
      rehabEstimateCents?: number;
      assignmentFeeCents?: number;
      radiusMiles?: number;
      searchMonths?: number;
      forceFresh?: boolean;
    }) => {
      const { data } = await api.post<GenerateCompResponse>(
        '/api/comps/generate',
        params,
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['property-comps', data.report.dominionLeadId] });
      if (data.cached) {
        toast.info('Using cached comp report (less than 24h old)');
      } else {
        toast.success(`Comp report generated — ${data.report.compCount} comps found`);
      }
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to generate comp report';
      toast.error(message);
    },
  });
}
