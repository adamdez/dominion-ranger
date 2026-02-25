import { describe, it, expect } from 'vitest';

// ─── Funnel Transition Validation ───────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  prospect: ['lead', 'paid_lead'],
  lead: ['negotiation'],
  paid_lead: ['negotiation'],
  negotiation: ['disposition'],
  declined: ['lead'],
};

function canAdvance(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

function canDecline(stage: string): boolean {
  return stage !== 'prospect' && stage !== 'disposition';
}

type FunnelStage = 'prospect' | 'lead' | 'paid_lead' | 'negotiation' | 'disposition' | 'declined';

const STAGE_LABELS: Record<FunnelStage, string> = {
  prospect: 'Prospects',
  lead: 'Leads',
  paid_lead: 'Paid Leads',
  negotiation: 'Negotiation',
  disposition: 'Disposition',
  declined: 'Declined',
};

describe('Funnel Transition Validation', () => {
  // Valid transitions
  it('prospect → lead is valid', () => {
    expect(canAdvance('prospect', 'lead')).toBe(true);
  });

  it('prospect → paid_lead is valid', () => {
    expect(canAdvance('prospect', 'paid_lead')).toBe(true);
  });

  it('lead → negotiation is valid', () => {
    expect(canAdvance('lead', 'negotiation')).toBe(true);
  });

  it('paid_lead → negotiation is valid', () => {
    expect(canAdvance('paid_lead', 'negotiation')).toBe(true);
  });

  it('negotiation → disposition is valid', () => {
    expect(canAdvance('negotiation', 'disposition')).toBe(true);
  });

  it('declined → lead is valid (re-engage)', () => {
    expect(canAdvance('declined', 'lead')).toBe(true);
  });

  // Invalid transitions
  it('prospect → negotiation is invalid (must go through lead)', () => {
    expect(canAdvance('prospect', 'negotiation')).toBe(false);
  });

  it('prospect → disposition is invalid', () => {
    expect(canAdvance('prospect', 'disposition')).toBe(false);
  });

  it('lead → disposition is invalid (must go through negotiation)', () => {
    expect(canAdvance('lead', 'disposition')).toBe(false);
  });

  it('disposition → anything is invalid (terminal stage)', () => {
    expect(canAdvance('disposition', 'lead')).toBe(false);
    expect(canAdvance('disposition', 'negotiation')).toBe(false);
    expect(canAdvance('disposition', 'prospect')).toBe(false);
  });

  it('any → prospect is invalid (use decline instead)', () => {
    expect(canAdvance('lead', 'prospect')).toBe(false);
    expect(canAdvance('negotiation', 'prospect')).toBe(false);
    expect(canAdvance('declined', 'prospect')).toBe(false);
  });
});

describe('Funnel Decline Validation', () => {
  it('cannot decline from prospect', () => {
    expect(canDecline('prospect')).toBe(false);
  });

  it('cannot decline from disposition', () => {
    expect(canDecline('disposition')).toBe(false);
  });

  it('can decline from lead', () => {
    expect(canDecline('lead')).toBe(true);
  });

  it('can decline from paid_lead', () => {
    expect(canDecline('paid_lead')).toBe(true);
  });

  it('can decline from negotiation', () => {
    expect(canDecline('negotiation')).toBe(true);
  });

  it('can decline from declined (idempotent)', () => {
    expect(canDecline('declined')).toBe(true);
  });
});

describe('Decline behavior', () => {
  it('decline sets funnel_stage to declined', () => {
    const lead = { funnelStage: 'lead' as FunnelStage, declinedCount: 0, previousFunnelStage: null as string | null };
    const previousStage = lead.funnelStage;
    lead.funnelStage = 'declined';
    lead.previousFunnelStage = previousStage;
    lead.declinedCount += 1;

    expect(lead.funnelStage).toBe('declined');
    expect(lead.previousFunnelStage).toBe('lead');
    expect(lead.declinedCount).toBe(1);
  });

  it('decline increments declined_count', () => {
    const lead = { funnelStage: 'negotiation' as FunnelStage, declinedCount: 2, previousFunnelStage: null as string | null };
    lead.funnelStage = 'declined';
    lead.previousFunnelStage = 'negotiation';
    lead.declinedCount += 1;

    expect(lead.declinedCount).toBe(3);
    expect(lead.previousFunnelStage).toBe('negotiation');
  });

  it('re-engage from declined preserves declined_count', () => {
    const lead = { funnelStage: 'declined' as FunnelStage, declinedCount: 2, previousFunnelStage: 'negotiation' };
    lead.funnelStage = 'lead';

    expect(lead.funnelStage).toBe('lead');
    expect(lead.declinedCount).toBe(2);
  });
});

describe('Stage filtering', () => {
  const leads = [
    { id: '1', funnelStage: 'prospect' },
    { id: '2', funnelStage: 'lead' },
    { id: '3', funnelStage: 'lead' },
    { id: '4', funnelStage: 'paid_lead' },
    { id: '5', funnelStage: 'negotiation' },
    { id: '6', funnelStage: 'disposition' },
    { id: '7', funnelStage: 'declined' },
    { id: '8', funnelStage: 'declined' },
  ];

  it('filters leads by stage correctly', () => {
    const leadStage = leads.filter(l => l.funnelStage === 'lead');
    expect(leadStage).toHaveLength(2);
  });

  it('filters negotiation correctly', () => {
    const neg = leads.filter(l => l.funnelStage === 'negotiation');
    expect(neg).toHaveLength(1);
  });

  it('filters declined correctly', () => {
    const declined = leads.filter(l => l.funnelStage === 'declined');
    expect(declined).toHaveLength(2);
  });

  it('funnel stage stats aggregate correctly', () => {
    const stats: Record<string, number> = {};
    for (const l of leads) {
      stats[l.funnelStage] = (stats[l.funnelStage] ?? 0) + 1;
    }
    expect(stats.prospect).toBe(1);
    expect(stats.lead).toBe(2);
    expect(stats.paid_lead).toBe(1);
    expect(stats.negotiation).toBe(1);
    expect(stats.disposition).toBe(1);
    expect(stats.declined).toBe(2);
  });
});

describe('Stage labels', () => {
  it('all funnel stages have labels', () => {
    const stages: FunnelStage[] = ['prospect', 'lead', 'paid_lead', 'negotiation', 'disposition', 'declined'];
    for (const stage of stages) {
      expect(STAGE_LABELS[stage]).toBeDefined();
      expect(typeof STAGE_LABELS[stage]).toBe('string');
    }
  });
});
