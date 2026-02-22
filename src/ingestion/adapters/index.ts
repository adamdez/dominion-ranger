export type { IngestionAdapter, EnrichmentAdapter, NormalizedRecord } from './interface.js';
export { PropertyRadarAdapter } from './property-radar.js';
export { RegridAdapter } from './regrid.js';
export { ForeclosureRadarAdapter } from './foreclosure-radar.js';
export { REISkipAdapter } from './reiskip.js';
export {
  initializeAdapters,
  registerIngestionAdapter,
  registerEnrichmentAdapter,
  getIngestionAdapter,
  getEnrichmentAdapter,
  getAllIngestionAdapters,
  getAllEnrichmentAdapters,
} from './registry.js';
