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
  topSignals?: string[];
  tags?: Array<{ name: string; color: string | null }>;
  lastActivity?: { type: string; channel: string; occurredAt: unknown } | null;
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

// ─── Funnel ──────────────────────────────────────────

export type FunnelStage = 'prospect' | 'lead' | 'paid_lead' | 'negotiation' | 'disposition' | 'declined';

export interface FunnelLead {
  leadInstanceId: string;
  dominionLeadId: string;
  status: string;
  funnelStage: FunnelStage;
  assignedTo: string | null;
  complianceCleared: boolean;
  version: number;
  declinedCount: number;
  declinedAt: string | null;
  previousFunnelStage: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  streetAddress: string | null;
  city: string | null;
  county: string | null;
  ownerName: string | null;
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
  phoneType: string | null;
  email: string | null;
  equityEstimate: string | null;
  compositeScore: number | null;
  motivationScore: number | null;
  dealScore: number | null;
  confidenceScore: number | null;
}

export interface FunnelStats {
  prospects: number;
  leads: number;
  paidLeads: number;
  negotiation: number;
  disposition: number;
  declined: number;
}

// ─── Prospects ───────────────────────────────────────

export interface Prospect {
  dominionLeadId: string;
  propertyId: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  ownerName: string | null;
  phone: string | null;
  equityEstimate: string | null;
  absenteeOwner: boolean;
  mortgageStatus: string;
  propertyType: string | null;
  compositeScore: number | null;
  motivationScore: number | null;
  dealScore: number | null;
  confidenceScore: number | null;
  leadInstanceId: string | null;
  leadStatus: string | null;
  signalCount: number | null;
  lastEventDate: string | null;
}

export interface PromoteResult {
  promoted: number;
  skipped: number;
  errors: number;
}

// ─── Phase 3: Pipeline / Deal Management ─────────────

export interface Tag {
  tagId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface LeadTag {
  leadInstanceId: string;
  tagId: string;
  tag: Tag;
}

export interface Task {
  id: string;
  dominionLeadId: string | null;
  leadInstanceId: string | null;
  assignedTo: string | null;
  title: string;
  description: string | null;
  taskType: string;
  dueAt: string | null;
  completedAt: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  priority: string;
  source: string;
  cadenceRule: string | null;
  attemptNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DistressEvent {
  eventId: string;
  dominionLeadId: string;
  eventType: string;
  eventLayer: string;
  severityLevel: string;
  source: string;
  eventDate: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
}

export interface PropertyDetail {
  dominionLeadId: string;
  propertyId: string;
  apn: string | null;
  county: string | null;
  state: string | null;
  standardizedAddress: string | null;
  streetAddress: string | null;
  city: string | null;
  zip: string | null;
  ownerName: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
  phoneType: string | null;
  phone2Type: string | null;
  phone3Type: string | null;
  email: string | null;
  email2: string | null;
  mailingAddress: string | null;
  mailAddress: string | null;
  mailCity: string | null;
  mailState: string | null;
  mailZip: string | null;
  mailVacant: boolean | null;
  purchaseDate: string | null;
  purchaseAmountCents: number | null;
  purchaseSeller: string | null;
  taxPerYearCents: number | null;
  estTaxPercent: string | null;
  taxDelinquentCents: number | null;
  estEquityPercent: string | null;
  estOpenLoansCents: number | null;
  cltvPercent: string | null;
  estOpenLoansCount: number | null;
  firstLoanPurpose: string | null;
  firstLoanType: string | null;
  firstLoanDate: string | null;
  firstLoanAmountCents: number | null;
  hudRent: number | null;
  propertyType: string | null;
  absenteeOwner: boolean;
  equityEstimate: string | null;
  mortgageStatus: string;
  ownershipDurationMonths: number | null;
  skipTraceTier: string | null;
  skipTracedAt: string | null;
  skipTraceSource: string | null;
  zoning: string | null;
  landUse: string | null;
  legalDescription: string | null;
  acreage: string | number | null;
  regridEnrichedAt: string | null;
  enrichedAt: string | null;
  bedrooms: number | null;
  bathrooms: string | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSqft: number | null;
  lastSaleDate: string | null;
  lastSalePriceCents: number | null;
  assessedValueCents: number | null;
  marketValueCents: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineLead extends LeadWithProperty {
  dealStage: string | null;
  tags: Tag[];
  offerAmountCents?: number | null;
  offerStatus?: OfferStatus | null;
}

export interface SavedFilter {
  filterId: string;
  name: string;
  filterConfig: Record<string, unknown>;
  createdAt: string;
}

export interface PipelineStats {
  stage: string;
  count: number;
  totalValueCents: number;
}

// ─── Offers ─────────────────────────────────────────

export type OfferStatus = 'draft' | 'sent' | 'viewed' | 'countered' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

export interface Offer {
  id: string;
  dominionLeadId: string;
  propertyId: string;
  leadInstanceId: string | null;
  createdBy: string;
  propertyAddress: string;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;
  propertyCounty: string | null;
  ownerName: string | null;
  offerAmountCents: number;
  earnestMoneyCents: number;
  closingDays: number;
  inspectionDays: number;
  offerExpiryDays: number;
  contingencies: string[] | null;
  additionalTerms: string | null;
  compReportId: string | null;
  arvCents: number | null;
  rehabEstimateCents: number | null;
  maxOfferCents: number | null;
  assignmentFeeCents: number | null;
  status: OfferStatus;
  counterAmountCents: number | null;
  counterNotes: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  pdfUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Communication / Dialer ─────────────────────────

export interface DialerStatusResponse {
  configured: boolean;
  clientConfigured: boolean;
}

export interface DialerTokenResponse {
  token: string;
  identity: string;
}

export interface CallInitiateResponse {
  callSid: string;
  status: string;
}

export interface SmsResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

export type ConversationMessage = {
  id: string;
  type: 'sms' | 'call';
  direction: string;
  body: string | null;
  phone: string;
  status: string | null;
  timestamp: string;
  messageSid?: string | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  callSid?: string | null;
};

export interface ConversationResponse {
  messages: ConversationMessage[];
  count: number;
}
