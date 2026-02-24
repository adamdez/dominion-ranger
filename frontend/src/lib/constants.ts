export const LEAD_STATUS = {
  PROMOTED: { label: 'Promoted', color: 'bg-emerald-500/10 text-emerald-400' },
  ASSIGNED: { label: 'Assigned', color: 'bg-zinc-500/10 text-zinc-300' },
  COMPLIANCE_PENDING: { label: 'Compliance', color: 'bg-amber-500/10 text-amber-400' },
  DIAL_READY: { label: 'Dial Ready', color: 'bg-emerald-500/10 text-emerald-400' },
  DIALING: { label: 'Dialing', color: 'bg-emerald-500/15 text-emerald-300' },
  CONTACTED: { label: 'Contacted', color: 'bg-zinc-500/10 text-zinc-300' },
  OFFER_SENT: { label: 'Offer Sent', color: 'bg-amber-500/10 text-amber-400' },
  CONTRACTED: { label: 'Contracted', color: 'bg-amber-500/15 text-amber-300' },
  CLOSED: { label: 'Closed', color: 'bg-emerald-500/15 text-emerald-300' },
  DEAD: { label: 'Dead', color: 'bg-rose-500/10 text-rose-400' },
} as const;

export const DISPOSITION_TYPES = {
  NO_ANSWER: { label: 'No Answer', action: 'stay' },
  LEFT_VOICEMAIL: { label: 'Left Voicemail', action: 'stay' },
  CALLBACK_REQUESTED: { label: 'Callback Requested', action: 'stay' },
  NOT_INTERESTED: { label: 'Not Interested', action: 'dead' },
  WRONG_NUMBER: { label: 'Wrong Number', action: 'dead' },
  DO_NOT_CALL: { label: 'Do Not Call', action: 'dnc' },
  INTERESTED: { label: 'Interested', action: 'contacted' },
  APPOINTMENT_SET: { label: 'Appointment Set', action: 'contacted' },
} as const;

export const SCORE_TIERS = {
  A: { min: 80, label: 'Tier A', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
  B: { min: 60, label: 'Tier B', color: 'bg-amber-500', textColor: 'text-amber-400' },
  C: { min: 40, label: 'Tier C', color: 'bg-orange-500', textColor: 'text-orange-400' },
  D: { min: 0, label: 'Tier D', color: 'bg-zinc-600', textColor: 'text-zinc-500' },
} as const;

export const DEAL_STAGES = [
  { key: 'NEW_LEAD', label: 'New Lead', color: 'border-zinc-700' },
  { key: 'SKIP_TRACED', label: 'Skip Traced', color: 'border-zinc-700' },
  { key: 'CONTACTED', label: 'Contacted', color: 'border-zinc-700' },
  { key: 'INTERESTED', label: 'Interested', color: 'border-amber-800' },
  { key: 'OFFER_MADE', label: 'Offer Made', color: 'border-amber-700' },
  { key: 'UNDER_CONTRACT', label: 'Under Contract', color: 'border-emerald-800' },
  { key: 'TITLE_ESCROW', label: 'Title / Escrow', color: 'border-emerald-700' },
  { key: 'CLOSED_WON', label: 'Closed Won', color: 'border-emerald-600' },
  { key: 'CLOSED_LOST', label: 'Closed Lost', color: 'border-rose-800' },
  { key: 'DEAD', label: 'Dead', color: 'border-rose-700' },
] as const;

export type DealStageKey = typeof DEAL_STAGES[number]['key'];

export const VALID_DEAL_TRANSITIONS: Record<string, string[]> = {
  NEW_LEAD: ['SKIP_TRACED', 'DEAD'],
  SKIP_TRACED: ['CONTACTED', 'DEAD'],
  CONTACTED: ['INTERESTED', 'DEAD'],
  INTERESTED: ['OFFER_MADE', 'DEAD'],
  OFFER_MADE: ['UNDER_CONTRACT', 'DEAD'],
  UNDER_CONTRACT: ['TITLE_ESCROW', 'CLOSED_LOST'],
  TITLE_ESCROW: ['CLOSED_WON', 'CLOSED_LOST'],
  CLOSED_WON: [],
  CLOSED_LOST: [],
  DEAD: ['NEW_LEAD'],
};

export const TASK_TYPES = {
  CALLBACK: { label: 'Callback', color: 'text-emerald-400' },
  FOLLOW_UP: { label: 'Follow Up', color: 'text-zinc-300' },
  RESEARCH: { label: 'Research', color: 'text-zinc-400' },
  SEND_OFFER: { label: 'Send Offer', color: 'text-amber-400' },
  SITE_VISIT: { label: 'Site Visit', color: 'text-zinc-300' },
  GENERAL: { label: 'General', color: 'text-zinc-500' },
} as const;

export type ScoreTier = keyof typeof SCORE_TIERS;

export function getScoreTier(score: number | null): ScoreTier {
  if (!score) return 'D';
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export function getStatusConfig(status: string) {
  return LEAD_STATUS[status as keyof typeof LEAD_STATUS] ?? {
    label: status, color: 'bg-zinc-500/10 text-zinc-400'
  };
}
