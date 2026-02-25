'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';

export interface FunnelDragData {
  leadInstanceId: string | null;
  dominionLeadId: string;
  currentStage: string;
  address: string;
}

interface OfferPrompt {
  data: FunnelDragData;
  targetStage: string;
}

interface FunnelDragContextValue {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  handleFunnelDrop: (data: FunnelDragData, targetStage: string) => Promise<void>;
  offerPrompt: OfferPrompt | null;
  setOfferPrompt: (v: OfferPrompt | null) => void;
  submitOfferAndAdvance: (amountCents: number) => Promise<void>;
}

const FunnelDragContext = createContext<FunnelDragContextValue | null>(null);

export function useFunnelDrag() {
  const ctx = useContext(FunnelDragContext);
  if (!ctx) throw new Error('useFunnelDrag must be used within FunnelDragProvider');
  return ctx;
}

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospects',
  lead: 'Leads',
  paid_lead: 'Paid Leads',
  negotiation: 'Negotiation',
  disposition: 'Disposition',
  declined: 'Declined',
};

export function FunnelDragProvider({ children }: { children: ReactNode }) {
  const [isDragging, setIsDragging] = useState(false);
  const [offerPrompt, setOfferPrompt] = useState<OfferPrompt | null>(null);
  const qc = useQueryClient();

  const advanceFunnel = useCallback(async (leadInstanceId: string, targetStage: string, opts?: { offerAmountCents?: number }) => {
    if (targetStage === 'declined') {
      await api.post('/api/funnel/decline', { leadInstanceId });
    } else {
      await api.post('/api/funnel/advance', {
        leadInstanceId,
        targetStage,
        ...(opts?.offerAmountCents ? { offerAmountCents: opts.offerAmountCents } : {}),
      });
    }
  }, []);

  const handleFunnelDrop = useCallback(async (data: FunnelDragData, targetStage: string) => {
    if (data.currentStage === targetStage) return;

    try {
      if (targetStage === 'negotiation' && data.currentStage !== 'disposition') {
        setOfferPrompt({ data, targetStage });
        return;
      }

      if (!data.leadInstanceId && (targetStage === 'lead' || targetStage === 'paid_lead')) {
        const { data: result } = await api.post<{ promoted: number; promotedInstances: Array<{ leadInstanceId: string }> }>(
          '/api/prospects/promote',
          { propertyIds: [data.dominionLeadId] },
        );
        if (result.promotedInstances?.[0]?.leadInstanceId) {
          const newId = result.promotedInstances[0].leadInstanceId;
          if (targetStage !== 'lead') {
            await advanceFunnel(newId, targetStage);
          }
        }
      } else if (data.leadInstanceId) {
        await advanceFunnel(data.leadInstanceId, targetStage);
      } else {
        toast.error('Cannot move a prospect without promoting first');
        return;
      }

      qc.invalidateQueries({ queryKey: ['funnel'] });
      qc.invalidateQueries({ queryKey: ['funnelStats'] });
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      toast.success(`Moved to ${STAGE_LABELS[targetStage] ?? targetStage}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to move — check that this transition is valid';
      toast.error(msg);
    }
  }, [advanceFunnel, qc]);

  const submitOfferAndAdvance = useCallback(async (amountCents: number) => {
    if (!offerPrompt) return;
    const { data, targetStage } = offerPrompt;
    try {
      if (!data.leadInstanceId) {
        const { data: result } = await api.post<{ promotedInstances: Array<{ leadInstanceId: string }> }>(
          '/api/prospects/promote',
          { propertyIds: [data.dominionLeadId] },
        );
        const newId = result.promotedInstances?.[0]?.leadInstanceId;
        if (newId) {
          await advanceFunnel(newId, 'lead');
          await advanceFunnel(newId, targetStage, { offerAmountCents: amountCents });
        }
      } else {
        await advanceFunnel(data.leadInstanceId, targetStage, { offerAmountCents: amountCents });
      }
      qc.invalidateQueries({ queryKey: ['funnel'] });
      qc.invalidateQueries({ queryKey: ['funnelStats'] });
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Moved to ${STAGE_LABELS[targetStage] ?? targetStage}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to advance';
      toast.error(msg);
    } finally {
      setOfferPrompt(null);
    }
  }, [offerPrompt, advanceFunnel, qc]);

  return (
    <FunnelDragContext.Provider value={{ isDragging, setIsDragging, handleFunnelDrop, offerPrompt, setOfferPrompt, submitOfferAndAdvance }}>
      {children}
    </FunnelDragContext.Provider>
  );
}
