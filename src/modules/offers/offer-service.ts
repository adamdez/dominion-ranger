import { eq, and, sql, lt, inArray, desc, ilike, or } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { offers, properties, tasks } from '../../db/schema/index.js';
import type { Offer, NewOffer } from '../../db/schema/index.js';
import { logActivity } from '../analytics/activity-logger.js';
import { generateOfferPdf } from './offer-pdf.js';
import { logger } from '../../config/logger.js';

function formatDollars(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function calcMaxOffer(arvCents?: number | null, rehabCents?: number | null, feeCents?: number | null): number | null {
  if (!arvCents || !rehabCents) return null;
  return Math.round(arvCents * 0.70) - rehabCents - (feeCents ?? 1000000);
}

// ─── Create ────────────────────────────────────────────

export interface CreateOfferParams {
  dominionLeadId: string;
  propertyId: string;
  leadInstanceId?: string;
  createdBy: string;
  offerAmountCents: number;
  earnestMoneyCents?: number;
  closingDays?: number;
  inspectionDays?: number;
  offerExpiryDays?: number;
  contingencies?: string[];
  additionalTerms?: string;
  compReportId?: string;
  arvCents?: number;
  rehabEstimateCents?: number;
  assignmentFeeCents?: number;
  notes?: string;
}

export async function createOffer(params: CreateOfferParams): Promise<Offer> {
  const [prop] = await db
    .select({
      address: properties.streetAddress,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      county: properties.county,
      ownerName: properties.ownerName,
    })
    .from(properties)
    .where(eq(properties.dominionLeadId, params.dominionLeadId))
    .limit(1);

  if (!prop) throw new Error(`Property not found: ${params.dominionLeadId}`);

  const maxOffer = calcMaxOffer(
    params.arvCents,
    params.rehabEstimateCents,
    params.assignmentFeeCents,
  );

  const values: NewOffer = {
    dominionLeadId: params.dominionLeadId,
    propertyId: params.propertyId,
    leadInstanceId: params.leadInstanceId ?? null,
    createdBy: params.createdBy,
    propertyAddress: prop.address ?? 'Unknown address',
    propertyCity: prop.city ?? null,
    propertyState: prop.state ?? null,
    propertyZip: prop.zip ?? null,
    propertyCounty: prop.county ?? null,
    ownerName: prop.ownerName ?? null,
    offerAmountCents: params.offerAmountCents,
    earnestMoneyCents: params.earnestMoneyCents ?? 100000,
    closingDays: params.closingDays ?? 21,
    inspectionDays: params.inspectionDays ?? 10,
    offerExpiryDays: params.offerExpiryDays ?? 7,
    contingencies: params.contingencies ?? ['inspection', 'title', 'financing'],
    additionalTerms: params.additionalTerms ?? null,
    compReportId: params.compReportId ?? null,
    arvCents: params.arvCents ?? null,
    rehabEstimateCents: params.rehabEstimateCents ?? null,
    maxOfferCents: maxOffer,
    assignmentFeeCents: params.assignmentFeeCents ?? 1000000,
    status: 'draft',
    notes: params.notes ?? null,
  };

  const [offer] = await db.insert(offers).values(values).returning();

  await logActivity({
    dominionLeadId: params.dominionLeadId,
    leadInstanceId: params.leadInstanceId,
    userId: params.createdBy,
    activityType: 'OFFER_SENT',
    channel: 'MANUAL_EMAIL',
    meta: { action: 'created', offerId: offer.id, amount: params.offerAmountCents },
  }).catch((err) => logger.warn({ err }, 'Failed to log offer creation activity'));

  return offer;
}

// ─── Update (draft only) ───────────────────────────────

export interface UpdateOfferParams {
  offerAmountCents?: number;
  earnestMoneyCents?: number;
  closingDays?: number;
  inspectionDays?: number;
  offerExpiryDays?: number;
  contingencies?: string[];
  additionalTerms?: string;
  compReportId?: string;
  arvCents?: number;
  rehabEstimateCents?: number;
  assignmentFeeCents?: number;
  notes?: string;
}

export async function updateOffer(offerId: string, updates: UpdateOfferParams): Promise<Offer> {
  const [existing] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!existing) throw new Error('Offer not found');
  if (existing.status !== 'draft') throw new Error('Only draft offers can be updated');

  const arvCents = updates.arvCents ?? existing.arvCents;
  const rehabCents = updates.rehabEstimateCents ?? existing.rehabEstimateCents;
  const feeCents = updates.assignmentFeeCents ?? existing.assignmentFeeCents;
  const maxOffer = calcMaxOffer(arvCents, rehabCents, feeCents);

  const [updated] = await db
    .update(offers)
    .set({
      ...updates,
      maxOfferCents: maxOffer,
      updatedAt: new Date(),
    })
    .where(eq(offers.id, offerId))
    .returning();

  return updated;
}

// ─── Send ──────────────────────────────────────────────

export async function sendOffer(offerId: string): Promise<Offer> {
  const [existing] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!existing) throw new Error('Offer not found');
  if (existing.status !== 'draft') throw new Error('Only draft offers can be sent');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + existing.offerExpiryDays * 24 * 60 * 60 * 1000);

  const [sent] = await db
    .update(offers)
    .set({
      status: 'sent',
      sentAt: now,
      expiresAt,
      updatedAt: now,
    })
    .where(eq(offers.id, offerId))
    .returning();

  // Generate PDF
  try {
    const pdfPath = await generateOfferPdf(sent);
    await db
      .update(offers)
      .set({ pdfUrl: pdfPath, updatedAt: new Date() })
      .where(eq(offers.id, offerId));
    sent.pdfUrl = pdfPath;
  } catch (err) {
    logger.error({ err, offerId }, 'Failed to generate offer PDF');
  }

  // Log activity
  await logActivity({
    dominionLeadId: sent.dominionLeadId,
    leadInstanceId: sent.leadInstanceId ?? undefined,
    userId: sent.createdBy,
    activityType: 'OFFER_SENT',
    channel: 'MANUAL_EMAIL',
    meta: { action: 'sent', offerId: sent.id, amount: sent.offerAmountCents },
  }).catch((err) => logger.warn({ err }, 'Failed to log offer sent activity'));

  // Create follow-up task
  const dueDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  await db
    .insert(tasks)
    .values({
      title: `Follow up on offer — ${sent.propertyAddress}`,
      taskType: 'FOLLOW_UP',
      leadInstanceId: sent.leadInstanceId ?? null,
      dominionLeadId: sent.dominionLeadId,
      assignedTo: sent.createdBy,
      createdBy: sent.createdBy,
      dueAt: dueDate,
      source: 'SYSTEM',
    })
    .catch((err) => logger.warn({ err }, 'Failed to create follow-up task'));

  return sent;
}

// ─── Record Response ───────────────────────────────────

export interface OfferResponseParams {
  status: 'accepted' | 'rejected' | 'countered' | 'withdrawn';
  counterAmountCents?: number;
  counterNotes?: string;
  notes?: string;
}

export async function recordOfferResponse(
  offerId: string,
  params: OfferResponseParams,
): Promise<Offer> {
  const [existing] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!existing) throw new Error('Offer not found');

  const validFromStatuses = ['sent', 'viewed', 'countered'];
  if (!validFromStatuses.includes(existing.status)) {
    throw new Error(`Cannot respond to offer with status: ${existing.status}`);
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: params.status,
    respondedAt: now,
    updatedAt: now,
  };

  if (params.notes) updateData.notes = params.notes;
  if (params.status === 'countered') {
    updateData.counterAmountCents = params.counterAmountCents ?? null;
    updateData.counterNotes = params.counterNotes ?? null;
  }

  const [updated] = await db
    .update(offers)
    .set(updateData)
    .where(eq(offers.id, offerId))
    .returning();

  // Log activity
  await logActivity({
    dominionLeadId: updated.dominionLeadId,
    leadInstanceId: updated.leadInstanceId ?? undefined,
    userId: updated.createdBy,
    activityType: 'OFFER_SENT',
    channel: 'MANUAL_EMAIL',
    meta: { action: params.status, offerId: updated.id, amount: updated.offerAmountCents },
  }).catch((err) => logger.warn({ err }, 'Failed to log offer response activity'));

  // If accepted, create contract task
  if (params.status === 'accepted') {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await db
      .insert(tasks)
      .values({
        title: `Send contract — ${updated.propertyAddress}`,
        taskType: 'SEND_OFFER',
        leadInstanceId: updated.leadInstanceId ?? null,
        dominionLeadId: updated.dominionLeadId,
        assignedTo: updated.createdBy,
        createdBy: updated.createdBy,
        dueAt: tomorrow,
        source: 'SYSTEM',
      })
      .catch((err) => logger.warn({ err }, 'Failed to create contract task'));
  }

  return updated;
}

// ─── List ──────────────────────────────────────────────

export interface ListOffersFilters {
  propertyId?: string;
  dominionLeadId?: string;
  status?: string;
  createdBy?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listOffers(
  filters: ListOffersFilters,
): Promise<{ offers: Offer[]; total: number }> {
  const conditions = [];

  if (filters.propertyId) {
    conditions.push(eq(offers.propertyId, filters.propertyId));
  }
  if (filters.dominionLeadId) {
    conditions.push(eq(offers.dominionLeadId, filters.dominionLeadId));
  }
  if (filters.status) {
    if (filters.status === 'active') {
      conditions.push(inArray(offers.status, ['sent', 'countered']));
    } else {
      conditions.push(eq(offers.status, filters.status));
    }
  }
  if (filters.createdBy) {
    conditions.push(eq(offers.createdBy, filters.createdBy));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(offers.propertyAddress, `%${filters.search}%`),
        ilike(offers.ownerName, `%${filters.search}%`),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(offers)
      .where(where)
      .orderBy(desc(offers.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(offers)
      .where(where),
  ]);

  return { offers: rows, total: countResult[0]?.count ?? 0 };
}

// ─── Get single ────────────────────────────────────────

export async function getOffer(offerId: string): Promise<Offer | null> {
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  return offer ?? null;
}

// ─── Expire stale ──────────────────────────────────────

export async function expireStaleOffers(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(offers)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(offers.status, 'sent'), lt(offers.expiresAt, now)))
    .returning({ id: offers.id });

  if (result.length > 0) {
    logger.info({ count: result.length }, 'Expired stale offers');
  }

  return result.length;
}

// ─── Delete (draft only) ───────────────────────────────

export async function deleteOffer(offerId: string): Promise<void> {
  const [existing] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!existing) throw new Error('Offer not found');
  if (existing.status !== 'draft') throw new Error('Only draft offers can be deleted');

  await db.delete(offers).where(eq(offers.id, offerId));
}

// ─── Stats ─────────────────────────────────────────────

export async function getOfferStats(createdBy?: string): Promise<{
  activeCount: number;
  totalAmountCents: number;
}> {
  const conditions = [inArray(offers.status, ['sent', 'countered'])];
  if (createdBy) conditions.push(eq(offers.createdBy, createdBy));

  const [result] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${offers.offerAmountCents}), 0)::bigint`,
    })
    .from(offers)
    .where(and(...conditions));

  return {
    activeCount: result?.count ?? 0,
    totalAmountCents: Number(result?.total ?? 0),
  };
}
