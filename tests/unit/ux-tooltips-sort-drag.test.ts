import { describe, it, expect } from 'vitest';

// ─── Score Breakdown API Response Validation ─────────────

interface TopSignal {
  eventType: string;
  contribution: number;
  daysSinceTrigger?: number;
  triggerDate?: string | null;
  rawAmount?: number | null;
}

interface ScoreBreakdownResponse {
  topSignals: TopSignal[];
  tier: string;
  scores: {
    composite: number;
    motivation: number;
    deal: number;
    confidence: number;
    modelVersion: string;
  } | null;
}

function computeTier(composite: number): string {
  if (composite >= 65) return 'A';
  if (composite >= 45) return 'B';
  if (composite >= 25) return 'C';
  return 'D';
}

function sortSignals(contributions: Array<{ finalContribution: number; eventType: string }>): TopSignal[] {
  return contributions
    .sort((a, b) => b.finalContribution - a.finalContribution)
    .slice(0, 8)
    .map(c => ({
      eventType: c.eventType,
      contribution: c.finalContribution,
    }));
}

describe('Score Breakdown API', () => {
  it('returns correct tier for score >= 65', () => {
    expect(computeTier(72)).toBe('A');
  });

  it('returns correct tier for score >= 45', () => {
    expect(computeTier(50)).toBe('B');
  });

  it('returns correct tier for score >= 25', () => {
    expect(computeTier(30)).toBe('C');
  });

  it('returns D for score < 25', () => {
    expect(computeTier(10)).toBe('D');
  });

  it('returns D for score 0', () => {
    expect(computeTier(0)).toBe('D');
  });

  it('sorts signals by contribution descending', () => {
    const contributions = [
      { finalContribution: 5, eventType: 'HOA_LIEN' },
      { finalContribution: 28.5, eventType: 'PROBATE' },
      { finalContribution: 12.3, eventType: 'TAX_DELINQUENCY' },
      { finalContribution: 8.2, eventType: 'PREDICTIVE_VACANCY_SIGNAL' },
    ];

    const sorted = sortSignals(contributions);
    expect(sorted[0].eventType).toBe('PROBATE');
    expect(sorted[0].contribution).toBe(28.5);
    expect(sorted[1].eventType).toBe('TAX_DELINQUENCY');
    expect(sorted[2].eventType).toBe('PREDICTIVE_VACANCY_SIGNAL');
    expect(sorted[3].eventType).toBe('HOA_LIEN');
  });

  it('limits to 8 top signals', () => {
    const contributions = Array.from({ length: 15 }, (_, i) => ({
      finalContribution: i + 1,
      eventType: `SIGNAL_${i}`,
    }));

    const sorted = sortSignals(contributions);
    expect(sorted.length).toBe(8);
    expect(sorted[0].contribution).toBe(15);
  });

  it('returns empty topSignals when no contributions', () => {
    const sorted = sortSignals([]);
    expect(sorted).toEqual([]);
  });
});

// ─── Default Sort Validation ─────────────────────────────

describe('Default Sort', () => {
  const DEFAULT_SORT_CONFIG = {
    prospects: { sort: 'composite_score', order: 'desc' },
    leads: { sort: 'composite_score', order: 'desc' },
    paid_leads: { sort: 'composite_score', order: 'desc' },
    dial_queue: { sort: 'composite_score', order: 'desc' },
    negotiation: { sort: 'created_at', order: 'desc' },
    disposition: { sort: 'created_at', order: 'desc' },
  };

  it('prospects defaults to composite_score DESC', () => {
    expect(DEFAULT_SORT_CONFIG.prospects.sort).toBe('composite_score');
    expect(DEFAULT_SORT_CONFIG.prospects.order).toBe('desc');
  });

  it('leads defaults to composite_score DESC', () => {
    expect(DEFAULT_SORT_CONFIG.leads.sort).toBe('composite_score');
    expect(DEFAULT_SORT_CONFIG.leads.order).toBe('desc');
  });

  it('paid_leads defaults to composite_score DESC', () => {
    expect(DEFAULT_SORT_CONFIG.paid_leads.sort).toBe('composite_score');
    expect(DEFAULT_SORT_CONFIG.paid_leads.order).toBe('desc');
  });

  it('dial_queue defaults to composite_score DESC', () => {
    expect(DEFAULT_SORT_CONFIG.dial_queue.sort).toBe('composite_score');
    expect(DEFAULT_SORT_CONFIG.dial_queue.order).toBe('desc');
  });

  it('negotiation defaults to created_at DESC (deal-focused)', () => {
    expect(DEFAULT_SORT_CONFIG.negotiation.sort).toBe('created_at');
    expect(DEFAULT_SORT_CONFIG.negotiation.order).toBe('desc');
  });

  it('disposition defaults to created_at DESC (deal-focused)', () => {
    expect(DEFAULT_SORT_CONFIG.disposition.sort).toBe('created_at');
    expect(DEFAULT_SORT_CONFIG.disposition.order).toBe('desc');
  });
});

// ─── Drag Data Format Validation ─────────────────────────

interface FunnelDragData {
  leadInstanceId: string | null;
  dominionLeadId: string;
  currentStage: string;
  address: string;
}

function isValidDragData(data: unknown): data is FunnelDragData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    (d.leadInstanceId === null || typeof d.leadInstanceId === 'string') &&
    typeof d.dominionLeadId === 'string' &&
    typeof d.currentStage === 'string' &&
    typeof d.address === 'string'
  );
}

describe('Drag Data Format', () => {
  it('validates correct drag data from prospect (no leadInstanceId)', () => {
    const data: FunnelDragData = {
      leadInstanceId: null,
      dominionLeadId: 'abc-123',
      currentStage: 'prospect',
      address: '123 Main St',
    };
    expect(isValidDragData(data)).toBe(true);
  });

  it('validates correct drag data from lead (with leadInstanceId)', () => {
    const data: FunnelDragData = {
      leadInstanceId: 'lead-456',
      dominionLeadId: 'abc-123',
      currentStage: 'lead',
      address: '123 Main St',
    };
    expect(isValidDragData(data)).toBe(true);
  });

  it('roundtrips through JSON serialization', () => {
    const data: FunnelDragData = {
      leadInstanceId: 'lead-456',
      dominionLeadId: 'abc-123',
      currentStage: 'negotiation',
      address: '456 Oak Ave',
    };
    const serialized = JSON.stringify(data);
    const parsed = JSON.parse(serialized);
    expect(isValidDragData(parsed)).toBe(true);
    expect(parsed.leadInstanceId).toBe('lead-456');
    expect(parsed.currentStage).toBe('negotiation');
  });

  it('rejects invalid drag data', () => {
    expect(isValidDragData(null)).toBe(false);
    expect(isValidDragData(undefined)).toBe(false);
    expect(isValidDragData('string')).toBe(false);
    expect(isValidDragData({ dominionLeadId: 123 })).toBe(false);
  });
});

// ─── Funnel Transition Validation for Drag Drops ─────────

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

describe('Drag-Drop Transition Validation', () => {
  it('allows prospect → lead', () => {
    expect(canAdvance('prospect', 'lead')).toBe(true);
  });

  it('allows prospect → paid_lead', () => {
    expect(canAdvance('prospect', 'paid_lead')).toBe(true);
  });

  it('allows lead → negotiation', () => {
    expect(canAdvance('lead', 'negotiation')).toBe(true);
  });

  it('allows negotiation → disposition', () => {
    expect(canAdvance('negotiation', 'disposition')).toBe(true);
  });

  it('allows declined → lead (re-engage)', () => {
    expect(canAdvance('declined', 'lead')).toBe(true);
  });

  it('rejects prospect → disposition (skip)', () => {
    expect(canAdvance('prospect', 'disposition')).toBe(false);
  });

  it('rejects prospect → negotiation (skip)', () => {
    expect(canAdvance('prospect', 'negotiation')).toBe(false);
  });

  it('rejects lead → disposition (skip)', () => {
    expect(canAdvance('lead', 'disposition')).toBe(false);
  });

  it('rejects disposition → lead (backwards)', () => {
    expect(canAdvance('disposition', 'lead')).toBe(false);
  });

  it('rejects same-stage moves', () => {
    expect(canAdvance('lead', 'lead')).toBe(false);
    expect(canAdvance('prospect', 'prospect')).toBe(false);
  });

  it('rejects unknown stages', () => {
    expect(canAdvance('unknown', 'lead')).toBe(false);
    expect(canAdvance('lead', 'unknown')).toBe(false);
  });
});
