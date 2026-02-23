export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

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

export interface LeadInstanceResponse {
  leadInstanceId: string;
  dominionLeadId: string;
  status: string;
  assignedTo: string | null;
  complianceCleared: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
}

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

export interface DispositionResponse {
  id: string;
  leadInstanceId: string;
  disposition: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
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

export interface LeadWithProperty {
  leadInstanceId: string;
  dominionLeadId: string;
  status: string;
  assignedTo: string | null;
  complianceCleared: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  streetAddress: string | null;
  city: string | null;
  county: string | null;
  ownerName: string | null;
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
  phoneType: string | null;
  phone2Type: string | null;
  phone3Type: string | null;
  email: string | null;
  email2: string | null;
  skipTraceTier: string | null;
  skipTracedAt: string | null;
  skipTraceSource: string | null;
  compositeScore: number | null;
  motivationScore: number | null;
  dealScore: number | null;
  confidenceScore: number | null;
  eventCount: number;
}

export interface SkipTraceResponse {
  success: boolean;
  tier: 'STANDARD' | 'ADVANCED';
  source: string;
  phone: string | null;
  additionalPhones: string[];
  email: string | null;
  costCents: number;
  error?: string;
}

export interface AuditLogEntry {
  logId: string;
  dominionLeadId: string | null;
  userId: string | null;
  actionType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RankedLead {
  dominionLeadId: string;
  apn: string | null;
  county: string | null;
  streetAddress: string | null;
  city: string | null;
  ownerName: string | null;
  phone: string | null;
  compositeScore: number;
  confidenceScore: number;
  scoreModelVersion: string;
  eventCount: number;
  marketingTier: string;
  urgencyLevel: string;
}
