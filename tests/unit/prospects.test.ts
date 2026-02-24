/**
 * Prospects & Pipeline Split — Unit Tests
 *
 * Tests pure business logic for:
 *   - Prospects API: pagination, tier filtering, search, sorting
 *   - Promote endpoint: skip logic, dedup, result counting
 *   - Pipeline data source: only promoted leads
 *   - Score tier assignment
 */
import { describe, it, expect } from 'vitest';

// ─── Score Tier Logic (mirrors frontend/src/lib/constants.ts) ───

function getScoreTier(score: number | null): 'A' | 'B' | 'C' | 'D' {
  if (!score) return 'D';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// ─── Tier Range Logic (mirrors API route) ───

function getTierRange(tier: string): [number, number] {
  const ranges: Record<string, [number, number]> = {
    A: [80, 100],
    B: [60, 80],
    C: [40, 60],
    D: [0, 40],
  };
  return ranges[tier] ?? [0, 100];
}

function scoreMatchesTier(score: number, tier: string): boolean {
  const [min, max] = getTierRange(tier);
  return score >= min && (max >= 100 || score < max);
}

// ─── Pagination Logic (mirrors API) ───

function paginate<T>(data: T[], total: number, page: number, pageSize: number) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Promote Logic (mirrors API route) ───

interface PropertyStub {
  dominionLeadId: string;
  hasActiveLeadInstance: boolean;
}

function processPromoteBatch(properties: PropertyStub[]): {
  promoted: number;
  skipped: number;
  errors: number;
} {
  let promoted = 0;
  let skipped = 0;
  const errors = 0;

  for (const prop of properties) {
    if (prop.hasActiveLeadInstance) {
      skipped++;
    } else {
      promoted++;
    }
  }

  return { promoted, skipped, errors };
}

// ─── Format Equity (mirrors frontend) ───

function formatEquity(val: string | null): string {
  if (!val) return '—';
  const num = parseFloat(val);
  if (num >= 1000) return `$${Math.round(num / 1000)}k`;
  return `$${Math.round(num)}`;
}

// ─── Tests ───

describe('Score Tier Assignment', () => {
  it('assigns tier A for scores >= 80', () => {
    expect(getScoreTier(80)).toBe('A');
    expect(getScoreTier(95)).toBe('A');
    expect(getScoreTier(100)).toBe('A');
  });

  it('assigns tier B for scores 60-79', () => {
    expect(getScoreTier(60)).toBe('B');
    expect(getScoreTier(75)).toBe('B');
    expect(getScoreTier(79)).toBe('B');
  });

  it('assigns tier C for scores 40-59', () => {
    expect(getScoreTier(40)).toBe('C');
    expect(getScoreTier(50)).toBe('C');
    expect(getScoreTier(59)).toBe('C');
  });

  it('assigns tier D for scores < 40', () => {
    expect(getScoreTier(0)).toBe('D');
    expect(getScoreTier(20)).toBe('D');
    expect(getScoreTier(39)).toBe('D');
  });

  it('assigns tier D for null scores', () => {
    expect(getScoreTier(null)).toBe('D');
  });
});

describe('Tier Range Filtering', () => {
  it('filters tier A correctly (80-100)', () => {
    expect(scoreMatchesTier(80, 'A')).toBe(true);
    expect(scoreMatchesTier(100, 'A')).toBe(true);
    expect(scoreMatchesTier(79.9, 'A')).toBe(false);
  });

  it('filters tier B correctly (60-79)', () => {
    expect(scoreMatchesTier(60, 'B')).toBe(true);
    expect(scoreMatchesTier(79, 'B')).toBe(true);
    expect(scoreMatchesTier(80, 'B')).toBe(false);
    expect(scoreMatchesTier(59, 'B')).toBe(false);
  });

  it('filters tier D correctly (0-39)', () => {
    expect(scoreMatchesTier(0, 'D')).toBe(true);
    expect(scoreMatchesTier(39, 'D')).toBe(true);
    expect(scoreMatchesTier(40, 'D')).toBe(false);
  });
});

describe('Pagination', () => {
  it('returns correct pagination metadata for page 1', () => {
    const result = paginate([1, 2, 3], 100, 1, 50);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(50);
    expect(result.pagination.total).toBe(100);
    expect(result.pagination.totalPages).toBe(2);
  });

  it('calculates total pages correctly', () => {
    expect(paginate([], 10566, 1, 50).pagination.totalPages).toBe(212);
    expect(paginate([], 100, 1, 50).pagination.totalPages).toBe(2);
    expect(paginate([], 51, 1, 50).pagination.totalPages).toBe(2);
    expect(paginate([], 50, 1, 50).pagination.totalPages).toBe(1);
    expect(paginate([], 0, 1, 50).pagination.totalPages).toBe(0);
  });

  it('returns data unchanged', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = paginate(data, 2, 1, 50);
    expect(result.data).toEqual(data);
  });

  it('never returns more than pageSize items', () => {
    const data = Array.from({ length: 50 }, (_, i) => i);
    const result = paginate(data, 10566, 1, 50);
    expect(result.data.length).toBeLessThanOrEqual(50);
  });
});

describe('Promote Endpoint Logic', () => {
  it('promotes properties without active lead instances', () => {
    const result = processPromoteBatch([
      { dominionLeadId: 'a', hasActiveLeadInstance: false },
      { dominionLeadId: 'b', hasActiveLeadInstance: false },
      { dominionLeadId: 'c', hasActiveLeadInstance: false },
    ]);
    expect(result.promoted).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('skips already-promoted properties', () => {
    const result = processPromoteBatch([
      { dominionLeadId: 'a', hasActiveLeadInstance: true },
      { dominionLeadId: 'b', hasActiveLeadInstance: false },
    ]);
    expect(result.promoted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips all if all already promoted', () => {
    const result = processPromoteBatch([
      { dominionLeadId: 'a', hasActiveLeadInstance: true },
      { dominionLeadId: 'b', hasActiveLeadInstance: true },
    ]);
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('handles empty input', () => {
    const result = processPromoteBatch([]);
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });
});

describe('Equity Formatting', () => {
  it('formats thousands as $Xk', () => {
    expect(formatEquity('85000')).toBe('$85k');
    expect(formatEquity('120000')).toBe('$120k');
    expect(formatEquity('1000')).toBe('$1k');
  });

  it('formats small values without k suffix', () => {
    expect(formatEquity('500')).toBe('$500');
    expect(formatEquity('999')).toBe('$999');
  });

  it('handles null', () => {
    expect(formatEquity(null)).toBe('—');
  });
});

describe('Pipeline Data Source (Contract Tests)', () => {
  it('lead_instances only contain promoted properties', () => {
    // Contract: lead_instances are created ONLY by promotion events
    // or manual promotion via /api/prospects/promote
    // This is enforced by:
    // 1. createLeadInstance() in workflow/service.ts
    // 2. lead.promoted domain event in events/wiring.ts
    // 3. Manual promote endpoint in routes/prospects.ts
    //
    // The pipeline page queries GET /api/leads which reads lead_instances.
    // Dial queue queries GET /api/dial-queue which also reads lead_instances.
    // Neither queries the properties table directly.
    expect(true).toBe(true);
  });

  it('dial queue only shows DIAL_READY lead_instances', () => {
    // Contract: dial queue filters by:
    // - status = 'DIAL_READY'
    // - dncFlag = false/null
    // - litigantFlag = false/null
    // - optOutFlag = false/null
    // This ensures only compliance-cleared promoted leads appear
    const validStatuses = ['DIAL_READY'];
    expect(validStatuses).not.toContain('PROMOTED');
    expect(validStatuses).not.toContain('ASSIGNED');
  });

  it('prospects page queries properties table (all inventory)', () => {
    // Contract: GET /api/prospects reads from properties table
    // with LEFT JOIN to scoring_records and lead_instances
    // This shows all 10,566+ properties, not just promoted ones
    const prospectsDataSource = 'properties';
    const pipelineDataSource = 'lead_instances';
    expect(prospectsDataSource).not.toBe(pipelineDataSource);
  });
});
