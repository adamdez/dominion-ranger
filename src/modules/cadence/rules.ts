import type { TaskTypeValue } from '../../db/schema/constants.js';

export interface CadenceRule {
  name: string;
  description: string;
  steps: CadenceStep[];
}

export interface CadenceStep {
  attemptNumber: number;
  delayMinutes: number;
  taskType: TaskTypeValue;
  title: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
}

export const VOICEMAIL_CADENCE: CadenceRule = {
  name: 'VOICEMAIL',
  description: 'Left voicemail — follow up sequence',
  steps: [
    { attemptNumber: 2, delayMinutes: 240, taskType: 'CALLBACK', title: 'Call back #2 (same day)', priority: 'HIGH' },
    { attemptNumber: 3, delayMinutes: 1440, taskType: 'CALLBACK', title: 'Call back #3 (next day)', priority: 'HIGH' },
    { attemptNumber: 4, delayMinutes: 2880, taskType: 'CALLBACK', title: 'Call back #4 (day 2)', priority: 'NORMAL' },
    { attemptNumber: 5, delayMinutes: 7200, taskType: 'CALLBACK', title: 'Call back #5 (day 5)', priority: 'NORMAL' },
    { attemptNumber: 6, delayMinutes: 14400, taskType: 'CALLBACK', title: 'Final attempt #6 (day 10)', priority: 'LOW' },
  ],
};

export const CALLBACK_REQUESTED_CADENCE: CadenceRule = {
  name: 'CALLBACK_REQUESTED',
  description: 'Homeowner asked us to call back',
  steps: [
    { attemptNumber: 2, delayMinutes: 1440, taskType: 'CALLBACK', title: 'Scheduled callback (next day)', priority: 'HIGH' },
  ],
};

export const INTERESTED_CADENCE: CadenceRule = {
  name: 'INTERESTED',
  description: 'Homeowner interested — send offer',
  steps: [
    { attemptNumber: 1, delayMinutes: 60, taskType: 'SEND_OFFER', title: 'Send offer within 1 hour', priority: 'HIGH' },
    { attemptNumber: 2, delayMinutes: 2880, taskType: 'CALLBACK', title: 'Follow up on offer (2 days)', priority: 'HIGH' },
  ],
};

export const NO_ANSWER_CADENCE: CadenceRule = {
  name: 'NO_ANSWER',
  description: 'No answer — try again',
  steps: [
    { attemptNumber: 2, delayMinutes: 120, taskType: 'CALLBACK', title: 'Retry call #2 (2 hours)', priority: 'NORMAL' },
    { attemptNumber: 3, delayMinutes: 1440, taskType: 'CALLBACK', title: 'Retry call #3 (next day)', priority: 'NORMAL' },
    { attemptNumber: 4, delayMinutes: 4320, taskType: 'CALLBACK', title: 'Retry call #4 (3 days)', priority: 'LOW' },
  ],
};

export const DISPOSITION_CADENCE_MAP: Record<string, CadenceRule> = {
  LEFT_VOICEMAIL: VOICEMAIL_CADENCE,
  NO_ANSWER: NO_ANSWER_CADENCE,
  CALLBACK_REQUESTED: CALLBACK_REQUESTED_CADENCE,
  INTERESTED: INTERESTED_CADENCE,
};
