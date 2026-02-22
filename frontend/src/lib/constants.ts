export const LEAD_STATUS = {
  PROMOTED: { label: 'Promoted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  ASSIGNED: { label: 'Assigned', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  COMPLIANCE_PENDING: { label: 'Compliance', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  DIAL_READY: { label: 'Dial Ready', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  DIALING: { label: 'Dialing', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  CONTACTED: { label: 'Contacted', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
  OFFER_SENT: { label: 'Offer Sent', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  CONTRACTED: { label: 'Contracted', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  CLOSED: { label: 'Closed', color: 'bg-green-200 text-green-900 dark:bg-green-900/40 dark:text-green-200' },
  DEAD: { label: 'Dead', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
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
  A: { min: 80, label: 'Tier A', color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-400' },
  B: { min: 60, label: 'Tier B', color: 'bg-yellow-500', textColor: 'text-yellow-700 dark:text-yellow-400' },
  C: { min: 40, label: 'Tier C', color: 'bg-orange-500', textColor: 'text-orange-700 dark:text-orange-400' },
  D: { min: 0, label: 'Tier D', color: 'bg-red-500', textColor: 'text-red-700 dark:text-red-400' },
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
    label: status, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
  };
}
