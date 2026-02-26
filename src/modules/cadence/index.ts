export { createFollowUpFromDisposition, getTaskStats } from './service.js';
export { DISPOSITION_CADENCE_MAP } from './rules.js';
export type { CadenceRule, CadenceStep } from './rules.js';

// Nurture cadence exports
export { NURTURE_CADENCE_STEPS } from './nurture-cadence.js';
export type { NurtureCadenceStep } from './nurture-cadence.js';
export {
  enrollInNurtureCadence,
  unenrollFromNurtureCadence,
  getNurtureCadenceProgress,
} from './nurture-service.js';
