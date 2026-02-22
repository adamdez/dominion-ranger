/**
 * Shared API response types.
 *
 * Used by route handlers (explicit return types) and by the frontend
 * (import these types into lib/types.ts for type-safe API consumption).
 */

// ─── Pagination ─────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function paginate<T>(data: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> {
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

// ─── Property Responses ─────────────────────────────

export interface PropertyResponse {
  dominionLeadId: string;
  apn: string | null;
  county: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ownerName: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
  phone: string | null;
  email: string | null;
  mailingAddress: string | null;
  absenteeOwner: boolean;
  equityEstimate: string | null;
  mortgageStatus: string;
}

// ─── Scoring Responses ──────────────────────────────

export interface ScoreResponse {
  compositeScore: number;
  motivationScore: number;
  dealScore: number;
  confidenceScore: number;
  equityMultiplier: number;
  suppressed: boolean;
  suppressionReason: string | null;
  modelVersion: string;
}

export interface ScoringStatsResponse {
  propertiesScored: number;
  totalRecords: number;
  avgScore: number;
  maxScore: number;
  tierA: number;
  tierB: number;
  tierC: number;
  belowThreshold: number;
  totalProperties: number;
  totalPromoted: number;
}

// ─── Lead Instance Responses ────────────────────────

export interface LeadInstanceResponse {
  leadInstanceId: string;
  dominionLeadId: string;
  status: string;
  assignedTo: string | null;
  complianceCleared: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Promotion Responses ────────────────────────────

export interface PromotedLeadResponse {
  promotionId: string;
  dominionLeadId: string;
  compositeScore: string;
  confidenceScore: string;
  marketingTier: string;
  urgencyLevel: string;
  recommendedAction: string | null;
  promotedAt: string;
}

// ─── System Responses ───────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
  };
}

export interface SystemStatsResponse {
  overview: {
    totalProperties: number;
    totalEvents: number;
    confirmedEvents: number;
    predictiveEvents: number;
    promotedLeads: number;
    absenteeOwners: number;
    withPhone: number;
    withEmail: number;
  };
  eventsByType: Array<{ eventType: string; count: number }>;
  scoring: {
    totalScored: number;
    avgScore: number;
    maxScore: number;
    minScore: number;
  } | null;
  uptime: number;
  timestamp: string;
}

// ─── Error Responses ────────────────────────────────

export interface ErrorResponse {
  error: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationErrorResponse {
  error: 'VALIDATION_ERROR';
  details: Array<{ path: string; message: string }>;
}
