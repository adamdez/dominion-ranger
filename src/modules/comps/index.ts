export {
  generateCompReport,
  getCompReport,
  getCompReportsForProperty,
  getLatestCompReport,
  hasRecentCompReport,
} from './comp-service.js';

export { fetchComps } from './batchdata-service.js';
export type {
  BatchDataComp,
  BatchDataCompRequest,
  BatchDataCompResponse,
} from './batchdata-service.js';

export { selectBestComps, assessCompQuality, analyzeComps } from './comp-selector.js';
export type {
  Comp,
  RankedComp,
  CompQuality,
  CompAnalysis,
} from './comp-selector.js';
