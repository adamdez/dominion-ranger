/**
 * Multi-Tier Contact Resolution Service
 * ─────────────────────────────────────────────────────
 * Resolves phone/email contacts for properties using a tiered strategy:
 *
 *   Tier 'free'  — Only data already in the system (property record, existing contacts)
 *   Tier 'basic' — Tracerfy skip trace ($0.02/record) — primary provider
 *   Tier 'deep'  — Tracerfy first, then BatchData fallback if no phones ($0.02-0.03/record)
 *
 * Tracerfy is primary: pay-as-you-go $0.02/record, 70-95% accuracy, up to 8 phones + 3 emails.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { properties, propertyContacts } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';
import { NotFoundError } from '../../lib/errors.js';
import { logActivity } from '../analytics/activity-logger.js';
import {
  batchDataSkipTrace,
  parseOwnerName,
  type BatchDataPerson,
} from './batchdata-skip-trace.js';

export type ContactTier = 'free' | 'basic' | 'deep';

export interface ResolvedContact {
  contactName: string | null;
  contactType: string;
  phone: string | null;
  phoneType: string | null;
  email: string | null;
  source: string;
  confidence: string;
  isPrimary: boolean;
  isNew: boolean;
}

export interface ContactResolutionResult {
  dominionLeadId: string;
  tier: ContactTier;
  contacts: ResolvedContact[];
  newContactsAdded: number;
  primaryPhone: string | null;
  costCents: number;
  errors: string[];
}

/**
 * Resolve contacts for a property using the specified tier.
 */
export async function resolveContacts(
  dominionLeadId: string,
  tier: ContactTier = 'basic',
): Promise<ContactResolutionResult> {
  logger.info(
    {
      dominionLeadId,
      tier,
      action: 'CONTACT_RESOLVE_START',
    },
    'Contact resolution starting',
  );

  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId));

  if (!property) {
    logger.error({ dominionLeadId }, 'Contact resolution: property not found');
    throw new NotFoundError('Property', dominionLeadId);
  }

  logger.info(
    {
      dominionLeadId,
      ownerName: property.ownerName,
      streetAddress: property.streetAddress,
      mailAddress: property.mailAddress ?? (property as { mailingAddress?: string }).mailingAddress ?? null,
      absenteeOwner: property.absenteeOwner,
      city: property.city,
      state: property.state,
      zip: property.zip,
    },
    'Contact resolution: property data loaded',
  );

  const existingContacts = await db
    .select()
    .from(propertyContacts)
    .where(eq(propertyContacts.dominionLeadId, dominionLeadId));

  const existingPhones = new Set(
    existingContacts.map((c) => c.phone).filter(Boolean),
  );
  const existingEmails = new Set(
    existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean),
  );

  const result: ContactResolutionResult = {
    dominionLeadId,
    tier,
    contacts: existingContacts.map((c) => ({
      contactName: c.contactName,
      contactType: c.contactType,
      phone: c.phone,
      phoneType: c.phoneType,
      email: c.email,
      source: c.source ?? 'unknown',
      confidence: c.confidence ?? 'medium',
      isPrimary: c.isPrimary ?? false,
      isNew: false,
    })),
    newContactsAdded: 0,
    primaryPhone: existingContacts.find((c) => c.isPrimary)?.phone ?? property.phone ?? null,
    costCents: 0,
    errors: [],
  };

  // Tier: basic or deep — Tracerfy skip trace (primary provider)
  if (tier === 'basic' || tier === 'deep') {
    try {
      logger.info({ dominionLeadId, tier }, 'Contact resolution: calling Tracerfy via skipTraceProperty');
      const { skipTraceProperty } = await import('../skip-trace/service.js');
      const tracerResult = await skipTraceProperty(dominionLeadId, 'STANDARD');

      logger.info(
        {
          dominionLeadId,
          success: tracerResult.success,
          source: tracerResult.source,
          costCents: tracerResult.costCents,
          phone: tracerResult.phone ?? null,
          allPhonesCount: tracerResult.allPhones?.length ?? 0,
          allEmailsCount: tracerResult.allEmails?.length ?? 0,
          error: tracerResult.error ?? null,
        },
        'Contact resolution: Tracerfy result',
      );

      if (tracerResult.success) {
        result.costCents += tracerResult.costCents;

        // Refresh contacts from DB (skipTraceProperty already inserts them)
        const refreshedContacts = await db
          .select()
          .from(propertyContacts)
          .where(eq(propertyContacts.dominionLeadId, dominionLeadId));

        // Find new contacts not in original existing set
        const newFromTracer = refreshedContacts.filter(
          (c) =>
            (c.phone && !existingPhones.has(c.phone)) ||
            (c.email && !existingEmails.has(c.email.toLowerCase() ?? '')),
        );

        const alreadyInResultPhones = new Set(result.contacts.map((c) => c.phone));
        const alreadyInResultEmails = new Set(
          result.contacts.map((c) => c.email?.toLowerCase()).filter(Boolean),
        );
        for (const c of newFromTracer) {
          const hasNewPhone = c.phone && !alreadyInResultPhones.has(c.phone);
          const hasNewEmail =
            c.email && !alreadyInResultEmails.has(c.email.toLowerCase() ?? '');
          if (hasNewPhone || hasNewEmail) {
            result.contacts.push({
              contactName: c.contactName,
              contactType: c.contactType,
              phone: c.phone,
              phoneType: c.phoneType,
              email: c.email,
              source: c.source ?? 'tracerfy',
              confidence: 'high',
              isPrimary: c.isPrimary ?? false,
              isNew: true,
            });
            result.newContactsAdded++;
            if (c.phone) alreadyInResultPhones.add(c.phone);
            if (c.email) alreadyInResultEmails.add(c.email.toLowerCase());
          }
        }
      } else if (tracerResult.error) {
        result.errors.push(`Tracerfy: ${tracerResult.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      result.errors.push(`Tracerfy skip trace failed: ${msg}`);
      logger.error(
        {
          err,
          dominionLeadId,
          errorMessage: msg,
          stack,
        },
        'Tracerfy skip trace EXCEPTION in contact resolver',
      );
    }
  }

  // Tier: deep — If Tracerfy returned no phones, try BatchData as fallback
  if (tier === 'deep') {
    const hasPhones = result.contacts.some((c) => c.phone);
    if (!hasPhones) {
      try {
        const ownerName =
          property.ownerName ?? (property as { owner_name?: string }).owner_name ?? '';
        const parsed = parseOwnerName(ownerName);

        if (parsed) {
          const firstName =
            property.ownerFirst ??
            (property as { owner_first?: string }).owner_first ??
            parsed.first;
          const lastName =
            property.ownerLast ??
            (property as { owner_last?: string }).owner_last ??
            parsed.last;

          // Use mailing address (more likely to reach owner), fall back to property
          const street =
            property.mailAddress ??
            (property as { mail_address?: string }).mail_address ??
            property.streetAddress ??
            '';
          const city =
            property.mailCity ??
            (property as { mail_city?: string }).mail_city ??
            property.city ??
            '';
          const state =
            property.mailState ??
            (property as { mail_state?: string }).mail_state ??
            property.state ??
            '';
          const zip =
            property.mailZip ??
            (property as { mail_zip?: string }).mail_zip ??
            property.zip ??
            '';

          if (street) {
            const batchResult = await batchDataSkipTrace({
              firstName,
              lastName,
              street,
              city,
              state,
              zip,
            });

            if (batchResult.success) {
              const newContacts = await insertPersonContacts(
                dominionLeadId,
                batchResult.persons,
                'batchdata',
                existingPhones,
                existingEmails,
              );
              result.newContactsAdded += newContacts.length;
              result.contacts.push(...newContacts);
              result.costCents += 1;
            } else if (batchResult.error) {
              result.errors.push(`BatchData fallback: ${batchResult.error}`);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`BatchData fallback failed: ${msg}`);
        logger.error({ err, dominionLeadId }, 'BatchData fallback error');
      }
    }
  }

  // Update properties.phone with best primary contact if we found new ones
  const primaryContact = result.contacts.find((c) => c.isPrimary && c.phone) ??
    result.contacts.find((c) => c.phone);
  if (primaryContact?.phone && !property.phone) {
    await db
      .update(properties)
      .set({
        phone: primaryContact.phone,
        phoneType: primaryContact.phoneType,
        skipTraceTier: tier === 'basic' ? 'STANDARD' : tier === 'deep' ? 'DEEP' : null,
        skipTracedAt: new Date(),
        skipTraceSource: primaryContact.source.toUpperCase(),
        updatedAt: new Date(),
      })
      .where(eq(properties.dominionLeadId, dominionLeadId));
  }

  result.primaryPhone = primaryContact?.phone ?? property.phone ?? null;

  // Log activity for cost tracking
  if (result.costCents > 0) {
    await logActivity({
      dominionLeadId,
      activityType: 'COMPLIANCE_CHECKED',
      channel: 'OUTBOUND_COLD',
      costCents: result.costCents,
      meta: {
        action: 'CONTACT_RESOLUTION',
        tier,
        newContactsAdded: result.newContactsAdded,
        totalContacts: result.contacts.length,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    }).catch((err) =>
      logger.error({ err }, 'Failed to log contact resolution activity'),
    );
  }

  logger.info(
    {
      dominionLeadId,
      tier,
      totalContacts: result.contacts.length,
      newContacts: result.newContactsAdded,
      costCents: result.costCents,
    },
    'Contact resolution completed',
  );

  return result;
}

/**
 * Insert BatchData persons into property_contacts, deduplicating against existing data.
 */
async function insertPersonContacts(
  dominionLeadId: string,
  persons: BatchDataPerson[],
  source: string,
  existingPhones: Set<string | null>,
  existingEmails: Set<string | undefined>,
): Promise<ResolvedContact[]> {
  const newContacts: ResolvedContact[] = [];
  const isFirst = existingPhones.size === 0 && existingEmails.size === 0;

  for (let pIdx = 0; pIdx < persons.length; pIdx++) {
    const person = persons[pIdx];
    const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || null;
    const contactType = person.relationship?.toUpperCase() ?? 'OWNER';
    const isPrimaryPerson = pIdx === 0 && isFirst;

    // Insert one row per phone
    for (let phIdx = 0; phIdx < person.phones.length; phIdx++) {
      const ph = person.phones[phIdx];
      if (existingPhones.has(ph.phone)) continue;

      const isPrimary = isPrimaryPerson && phIdx === 0;
      const email = person.emails[phIdx]?.email ?? (phIdx === 0 ? person.emails[0]?.email : null) ?? null;

      await db.insert(propertyContacts).values({
        dominionLeadId,
        contactName: fullName,
        contactType,
        phone: ph.phone,
        phoneType: ph.phoneType,
        phoneStatus: ph.isConnected === true ? 'CONNECTED' : ph.isConnected === false ? 'DISCONNECTED' : 'UNKNOWN',
        email,
        source,
        confidence: 'medium',
        isPrimary,
        isOwnerMatch: contactType === 'OWNER',
        rawData: { source, person: { firstName: person.firstName, lastName: person.lastName } },
      });

      existingPhones.add(ph.phone);
      if (email) existingEmails.add(email.toLowerCase());

      newContacts.push({
        contactName: fullName,
        contactType,
        phone: ph.phone,
        phoneType: ph.phoneType,
        email,
        source,
        confidence: 'medium',
        isPrimary,
        isNew: true,
      });
    }

    // Insert emails that weren't attached to a phone row
    for (const em of person.emails) {
      if (existingEmails.has(em.email)) continue;
      if (newContacts.some((c) => c.email === em.email)) continue;

      await db.insert(propertyContacts).values({
        dominionLeadId,
        contactName: fullName,
        contactType,
        email: em.email,
        source,
        confidence: 'medium',
        isPrimary: false,
        isOwnerMatch: contactType === 'OWNER',
      });

      existingEmails.add(em.email);
      newContacts.push({
        contactName: fullName,
        contactType,
        phone: null,
        phoneType: null,
        email: em.email,
        source,
        confidence: 'low',
        isPrimary: false,
        isNew: true,
      });
    }
  }

  return newContacts;
}

/**
 * Add a manual contact for a property.
 */
export async function addManualContact(
  dominionLeadId: string,
  data: {
    contactName?: string;
    contactType?: string;
    phone?: string;
    email?: string;
    notes?: string;
    isPrimary?: boolean;
  },
): Promise<void> {
  const [property] = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId));

  if (!property) throw new NotFoundError('Property', dominionLeadId);

  // If marking as primary, unmark any existing primary
  if (data.isPrimary) {
    await db
      .update(propertyContacts)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(propertyContacts.dominionLeadId, dominionLeadId));
  }

  await db.insert(propertyContacts).values({
    dominionLeadId,
    contactName: data.contactName ?? null,
    contactType: data.contactType ?? 'OWNER',
    phone: data.phone ?? null,
    email: data.email ?? null,
    source: 'manual',
    confidence: 'high',
    isPrimary: data.isPrimary ?? false,
    isOwnerMatch: false,
    notes: data.notes ?? null,
  });

  // If primary and has phone, update properties table too
  if (data.isPrimary && data.phone) {
    await db
      .update(properties)
      .set({ phone: data.phone, updatedAt: new Date() })
      .where(eq(properties.dominionLeadId, dominionLeadId));
  }
}
