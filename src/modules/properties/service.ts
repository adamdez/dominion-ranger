import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { properties } from '../../db/schema/index.js';
import type { Property } from '../../db/schema/index.js';
import { generateId, standardizeAddress } from '../../lib/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';
import type { MortgageStatusValue } from '../../db/schema/constants.js';
import { MortgageStatus } from '../../db/schema/constants.js';

export interface PropertyIdentity {
  apn?: string | null;
  county?: string | null;
  state?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  zip?: string | null;
  ownerName?: string | null;
  ownerFirst?: string | null;
  ownerLast?: string | null;
}

export interface PropertyData extends PropertyIdentity {
  phone?: string | null;
  email?: string | null;
  mailingAddress?: string | null;
  ownershipDurationMonths?: number | null;
  absenteeOwner?: boolean | null;
  equityEstimate?: string | null;
  mortgageStatus?: MortgageStatusValue;
  propertyAttributes?: Record<string, unknown> | null;
}

/**
 * Charter-mandated atomic upsert for property identity resolution.
 *
 * When APN + County present: INSERT ... ON CONFLICT (apn, county) DO UPDATE
 * When either absent: INSERT only (no identity dedup possible)
 *
 * Never uses SELECT-then-INSERT. The dominion_lead_id is immutable once assigned.
 */
export async function findOrCreateProperty(data: PropertyData): Promise<{ property: Property; created: boolean }> {
  if (data.apn && data.county) {
    return atomicUpsertByApnCounty(data);
  }
  return insertNewProperty(data);
}

async function atomicUpsertByApnCounty(data: PropertyData): Promise<{ property: Property; created: boolean }> {
  const candidateId = generateId();
  const candidatePropertyId = generateId();
  const standardized = buildStandardizedAddress(data);

  const [result] = await db
    .insert(properties)
    .values({
      dominionLeadId: candidateId,
      propertyId: candidatePropertyId,
      apn: data.apn!,
      county: data.county!,
      state: data.state ?? null,
      standardizedAddress: standardized,
      streetAddress: data.streetAddress ?? null,
      city: data.city ?? null,
      zip: data.zip ?? null,
      ownerName: data.ownerName ?? null,
      ownerFirst: data.ownerFirst ?? null,
      ownerLast: data.ownerLast ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      mailingAddress: data.mailingAddress ?? null,
      ownershipDurationMonths: data.ownershipDurationMonths ?? null,
      absenteeOwner: data.absenteeOwner ?? false,
      equityEstimate: data.equityEstimate ?? null,
      mortgageStatus: data.mortgageStatus ?? MortgageStatus.UNKNOWN,
    })
    .onConflictDoUpdate({
      target: [properties.apn, properties.county],
      set: {
        phone: sql`COALESCE(excluded.phone, ${properties.phone})`,
        email: sql`COALESCE(excluded.email, ${properties.email})`,
        mailingAddress: sql`COALESCE(excluded.mailing_address, ${properties.mailingAddress})`,
        ownerFirst: sql`COALESCE(excluded.owner_first, ${properties.ownerFirst})`,
        ownerLast: sql`COALESCE(excluded.owner_last, ${properties.ownerLast})`,
        ownerName: sql`COALESCE(excluded.owner_name, ${properties.ownerName})`,
        equityEstimate: sql`COALESCE(excluded.equity_estimate, ${properties.equityEstimate})`,
        ownershipDurationMonths: sql`COALESCE(excluded.ownership_duration_months, ${properties.ownershipDurationMonths})`,
        absenteeOwner: sql`COALESCE(excluded.absentee_owner, ${properties.absenteeOwner})`,
        mortgageStatus: sql`COALESCE(excluded.mortgage_status, ${properties.mortgageStatus})`,
        standardizedAddress: sql`COALESCE(excluded.standardized_address, ${properties.standardizedAddress})`,
        streetAddress: sql`COALESCE(excluded.street_address, ${properties.streetAddress})`,
        city: sql`COALESCE(excluded.city, ${properties.city})`,
        zip: sql`COALESCE(excluded.zip, ${properties.zip})`,
        state: sql`COALESCE(excluded.state, ${properties.state})`,
        updatedAt: new Date(),
      },
    })
    .returning();

  const created = result.dominionLeadId === candidateId;

  if (created) {
    logger.info({ dominionLeadId: result.dominionLeadId, apn: data.apn, county: data.county }, 'Property created');
    domainEvents.emit('property.created', { dominionLeadId: result.dominionLeadId });
  } else {
    const enrichableFields = [
      'phone', 'email', 'mailingAddress', 'ownerFirst', 'ownerLast', 'ownerName',
      'equityEstimate', 'ownershipDurationMonths', 'absenteeOwner', 'mortgageStatus',
      'standardizedAddress', 'streetAddress', 'city', 'zip', 'state',
    ];
    domainEvents.emit('property.updated', { dominionLeadId: result.dominionLeadId, fields: enrichableFields });
  }

  return { property: result, created };
}

async function insertNewProperty(data: PropertyData): Promise<{ property: Property; created: boolean }> {
  const dominionLeadId = generateId();
  const propertyId = generateId();
  const standardized = buildStandardizedAddress(data);

  const [created] = await db.insert(properties).values({
    dominionLeadId,
    propertyId,
    apn: data.apn ?? null,
    county: data.county ?? null,
    state: data.state ?? null,
    standardizedAddress: standardized,
    streetAddress: data.streetAddress ?? null,
    city: data.city ?? null,
    zip: data.zip ?? null,
    ownerName: data.ownerName ?? null,
    ownerFirst: data.ownerFirst ?? null,
    ownerLast: data.ownerLast ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    mailingAddress: data.mailingAddress ?? null,
    ownershipDurationMonths: data.ownershipDurationMonths ?? null,
    absenteeOwner: data.absenteeOwner ?? false,
    equityEstimate: data.equityEstimate ?? null,
    mortgageStatus: data.mortgageStatus ?? MortgageStatus.UNKNOWN,
  }).returning();

  logger.info({ dominionLeadId, apn: data.apn, county: data.county }, 'Property created');
  domainEvents.emit('property.created', { dominionLeadId });
  return { property: created, created: true };
}

function buildStandardizedAddress(data: PropertyData): string | null {
  return data.streetAddress
    ? standardizeAddress(
        [data.streetAddress, data.city, data.state, data.zip].filter(Boolean).join(', '),
      )
    : null;
}

export async function getPropertyById(dominionLeadId: string): Promise<Property> {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId));

  if (!property) {
    throw new NotFoundError('Property', dominionLeadId);
  }
  return property;
}

export async function getPropertyByApnCounty(apn: string, county: string): Promise<Property | null> {
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.apn, apn), eq(properties.county, county)));
  return property ?? null;
}

export async function getPropertyCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(properties);
  return result.count;
}
