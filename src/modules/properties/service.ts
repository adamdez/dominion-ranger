import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { properties } from '../../db/schema/index.js';
import type { Property, NewProperty } from '../../db/schema/index.js';
import { generateId, standardizeAddress } from '../../lib/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

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
  mortgageStatus?: 'CURRENT' | 'LATE_30' | 'LATE_60' | 'LATE_90' | 'DEFAULT' | 'FORECLOSURE' | 'FREE_AND_CLEAR' | 'UNKNOWN';
  propertyAttributes?: Record<string, any> | null;
}

/**
 * Find or create a property. This is the primary identity resolution path.
 *
 * Resolution order:
 * 1. APN + County (strongest — parcel-level unique)
 * 2. If no match, create new property with UUID v7 dominion_lead_id
 *
 * The dominion_lead_id is immutable once created. This is charter-mandated.
 */
export async function findOrCreateProperty(data: PropertyData): Promise<{ property: Property; created: boolean }> {
  // Attempt match on APN + County
  if (data.apn && data.county) {
    const existing = await db
      .select()
      .from(properties)
      .where(and(eq(properties.apn, data.apn), eq(properties.county, data.county)))
      .limit(1);

    if (existing.length > 0) {
      // Update enrichable fields (never overwrite dominion_lead_id)
      const updated = await updatePropertyFields(existing[0].dominionLeadId, data);
      return { property: updated, created: false };
    }
  }

  // No match — create new property
  const dominionLeadId = generateId();
  const propertyId = generateId();

  const standardized = data.streetAddress
    ? standardizeAddress(
        [data.streetAddress, data.city, data.state, data.zip].filter(Boolean).join(', '),
      )
    : null;

  const newProp: NewProperty = {
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
    mortgageStatus: data.mortgageStatus ?? 'UNKNOWN',
  };

  const [created] = await db.insert(properties).values(newProp).returning();

  logger.info({ dominionLeadId, apn: data.apn, county: data.county }, 'Property created');
  domainEvents.emit('property.created', { dominionLeadId });

  return { property: created, created: true };
}

/**
 * Update enrichable fields on an existing property.
 * Only updates fields that are currently null or explicitly provided.
 * Never overwrites dominion_lead_id or property_id.
 */
async function updatePropertyFields(dominionLeadId: string, data: PropertyData): Promise<Property> {
  const updates: Record<string, unknown> = {};
  const changedFields: string[] = [];

  const enrichable: (keyof PropertyData)[] = [
    'phone', 'email', 'mailingAddress', 'ownerFirst', 'ownerLast',
    'ownerName', 'ownershipDurationMonths', 'absenteeOwner',
    'equityEstimate', 'mortgageStatus', 'propertyAttributes',
  ];

  for (const field of enrichable) {
    if (data[field] !== undefined && data[field] !== null) {
      updates[field] = data[field];
      changedFields.push(field);
    }
  }

  if (changedFields.length === 0) {
    const [existing] = await db
      .select()
      .from(properties)
      .where(eq(properties.dominionLeadId, dominionLeadId));
    return existing;
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(properties)
    .set(updates)
    .where(eq(properties.dominionLeadId, dominionLeadId))
    .returning();

  if (changedFields.length > 0) {
    domainEvents.emit('property.updated', { dominionLeadId, fields: changedFields });
  }

  return updated;
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

/**
 * Get total property count — used for health checks and monitoring.
 */
export async function getPropertyCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(properties);
  return result.count;
}
