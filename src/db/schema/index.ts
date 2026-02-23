// ─── Enums ─────────────────────────────────────────
export * from './enums';

// ─── Typed Constants ──────────────────────────────
export * from './constants';

// ─── Core Tables ───────────────────────────────────
export { properties } from './properties';
export type { Property, NewProperty } from './properties';

export { distressEvents } from './distress-events';
export type { DistressEvent, NewDistressEvent } from './distress-events';

export { scoringRecords } from './scoring-records';
export type { ScoringRecord, NewScoringRecord } from './scoring-records';

export { signalAccumulation } from './signal-accumulation';
export type { SignalAccumulation, NewSignalAccumulation } from './signal-accumulation';

export { promotedLeads } from './promoted-leads';
export type { PromotedLead, NewPromotedLead } from './promoted-leads';

export { leadInstances } from './lead-instances';
export type { LeadInstance, NewLeadInstance } from './lead-instances';

export { outcomeReservoir } from './outcome-reservoir';
export type { OutcomeReservoir, NewOutcomeReservoir } from './outcome-reservoir';

// ─── Config Tables ─────────────────────────────────
export { scoringModelConfigs } from './scoring-model-configs';
export type { ScoringModelConfig, NewScoringModelConfig } from './scoring-model-configs';

export { systemSettings } from './system-settings';
export type { SystemSetting, NewSystemSetting } from './system-settings';

export { dispositions } from './dispositions';
export type { Disposition, NewDisposition } from './dispositions';

// ─── Inbound ──────────────────────────────────────
export { inboundLeads } from './inbound-leads';
export type { InboundLead, NewInboundLead } from './inbound-leads';

// ─── Auth & Audit ──────────────────────────────────
export { auditLog } from './audit-log';
export type { AuditLogEntry, NewAuditLogEntry } from './audit-log';

export { users } from './users';
export type { User, NewUser } from './users';

// ─── Analytics & Attribution ────────────────────────
export * from './activity-log-v2';
export * from './deals';
export * from './marketing';
