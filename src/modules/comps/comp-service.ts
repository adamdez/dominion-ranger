import { db } from '../../db/connection.js';
import { compReports } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { fetchComps } from './batchdata-service.js';
import { logger } from '../../config/logger.js';

interface GenerateCompReportOptions {
  dominionLeadId: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  rehabEstimateCents?: number;
  assignmentFeeCents?: number;
  radiusMiles?: number;
  searchMonths?: number;
  generatedBy?: string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function generateCompReport(options: GenerateCompReportOptions) {
  const {
    dominionLeadId,
    address,
    city,
    state,
    zip,
    beds,
    baths,
    sqft,
    lotSqft,
    yearBuilt,
    propertyType,
    rehabEstimateCents = 0,
    assignmentFeeCents = 500000,
    radiusMiles = 0.5,
    searchMonths = 6,
    generatedBy = 'system',
  } = options;

  const result = await fetchComps({
    address,
    city,
    state,
    zip,
    radius: radiusMiles,
    months: searchMonths,
  });

  const arvCents = result.estimatedValueCents || result.medianSalePriceCents;

  // Wholesale formula: Max Offer = (ARV × 0.70) - Rehab - Assignment Fee
  const maxOfferCents =
    arvCents > 0
      ? Math.round(arvCents * 0.7) - rehabEstimateCents - assignmentFeeCents
      : 0;

  const [report] = await db
    .insert(compReports)
    .values({
      dominionLeadId,
      subjectAddress: address,
      subjectCity: city ?? null,
      subjectState: state ?? null,
      subjectZip: zip ?? null,
      subjectBeds: beds ?? null,
      subjectBaths: baths != null ? String(baths) : null,
      subjectSqft: sqft ?? null,
      subjectLotSqft: lotSqft ?? null,
      subjectYearBuilt: yearBuilt ?? null,
      subjectPropertyType: propertyType ?? null,
      estimatedValueCents: result.estimatedValueCents,
      estimatedValueLowCents: result.estimatedValueLowCents,
      estimatedValueHighCents: result.estimatedValueHighCents,
      confidenceScore: result.confidenceScore != null ? String(result.confidenceScore) : null,
      comps: result.comps,
      compCount: result.comps.length,
      avgPricePerSqftCents: result.avgPricePerSqftCents,
      medianSalePriceCents: result.medianSalePriceCents,
      arvCents,
      maxOfferCents: maxOfferCents > 0 ? maxOfferCents : null,
      rehabEstimateCents,
      assignmentFeeCents,
      searchRadiusMiles: String(radiusMiles),
      searchMonths,
      batchdataRequestId: result.requestId,
      rawResponse: result.rawResponse,
      generatedBy,
    })
    .returning();

  logger.info(
    { reportId: report.id, dominionLeadId, compCount: result.comps.length, arvCents, maxOfferCents },
    'Comp report generated',
  );

  return report;
}

export async function getCompReport(reportId: string) {
  const [report] = await db
    .select()
    .from(compReports)
    .where(eq(compReports.id, reportId))
    .limit(1);
  return report ?? null;
}

export async function getCompReportsForProperty(dominionLeadId: string) {
  return db
    .select()
    .from(compReports)
    .where(eq(compReports.dominionLeadId, dominionLeadId))
    .orderBy(desc(compReports.createdAt));
}

export async function getLatestCompReport(dominionLeadId: string) {
  const [report] = await db
    .select()
    .from(compReports)
    .where(eq(compReports.dominionLeadId, dominionLeadId))
    .orderBy(desc(compReports.createdAt))
    .limit(1);
  return report ?? null;
}

/**
 * Returns true if a comp report was generated within the last 24 hours
 * for the given property — used to avoid redundant BatchData calls.
 */
export async function hasRecentCompReport(dominionLeadId: string): Promise<boolean> {
  const latest = await getLatestCompReport(dominionLeadId);
  if (!latest) return false;
  return Date.now() - new Date(latest.createdAt).getTime() < TWENTY_FOUR_HOURS_MS;
}
