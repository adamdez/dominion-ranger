#!/usr/bin/env npx tsx
/**
 * End-to-end skip trace verification script.
 *
 * 1) Selects or creates a single test property (with known mailing address).
 * 2) Calls the skip trace service (same as API endpoint).
 * 3) Waits for completion (polling is built into the service).
 * 4) Confirms property_contacts has new rows (phones/emails).
 * 5) Prints PASS/FAIL with counts and example values (masked).
 *
 * Run: npx tsx src/scripts/verify-skip-trace.ts
 * Or:  SKIP_TRACE_VERIFY_LEAD_ID=<uuid> npx tsx src/scripts/verify-skip-trace.ts
 *
 * Requires: DATABASE_URL, TRACERFY_API_KEY
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { properties, propertyContacts } from '../db/schema/index.js';
import { skipTraceProperty } from '../modules/skip-trace/index.js';
import { generateId } from '../lib/ids.js';

const TEST_DOMINION_LEAD_ID = '00000000-0000-0000-0000-00000000babe';
const TEST_APN = 'VERIFY-SKIP-TRACE';
const TEST_COUNTY = 'VERIFY';

function maskPhone(phone: string | null): string {
  if (!phone) return '(none)';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

function maskEmail(email: string | null): string {
  if (!email) return '(none)';
  const [local, domain] = email.split('@');
  if (!domain) return '(invalid)';
  const masked = local.length <= 2 ? '**' : local.slice(0, 2) + '***';
  return `${masked}@${domain}`;
}

async function main(): Promise<void> {
  // 1. Check Tracefy credentials
  const tracerfyKey = process.env.TRACERFY_API_KEY;
  if (!tracerfyKey || tracerfyKey.trim() === '') {
    console.error('\n❌ TRACERFY_API_KEY is not set or empty.');
    console.error('   Set TRACERFY_API_KEY in .env to run skip trace verification.');
    console.error('   Example: TRACERFY_API_KEY=your-api-key-here\n');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL is not set.\n');
    process.exit(1);
  }

  console.log('\n🔬 Skip Trace E2E Verification\n');
  console.log('   Step 1: Select or create test property...');

  let dominionLeadId: string;
  let created = false;

  const existingLeadId = process.env.SKIP_TRACE_VERIFY_LEAD_ID;
  if (existingLeadId) {
    const [existing] = await db
      .select()
      .from(properties)
      .where(eq(properties.dominionLeadId, existingLeadId));
    if (!existing) {
      console.error(`\n❌ Property not found for SKIP_TRACE_VERIFY_LEAD_ID=${existingLeadId}\n`);
      process.exit(1);
    }
    dominionLeadId = existingLeadId;
    console.log(`   Using existing property: ${dominionLeadId}`);
  } else {
    // Create test property with known mailing address
    await db.execute(sql`DELETE FROM property_contacts WHERE dominion_lead_id = ${TEST_DOMINION_LEAD_ID}`);
    await db.execute(
      sql`DELETE FROM properties WHERE dominion_lead_id = ${TEST_DOMINION_LEAD_ID}`,
    );

    await db.insert(properties).values({
      dominionLeadId: TEST_DOMINION_LEAD_ID,
      propertyId: generateId(),
      apn: TEST_APN,
      county: TEST_COUNTY,
      state: 'WA',
      streetAddress: '123 Main St',
      city: 'Spokane',
      zip: '99201',
      ownerFirst: 'Test',
      ownerLast: 'Owner',
      ownerName: 'Test Owner',
      mailAddress: '456 Oak Ave',
      mailCity: 'Spokane',
      mailState: 'WA',
      mailZip: '99202',
    });
    dominionLeadId = TEST_DOMINION_LEAD_ID;
    created = true;
    console.log(`   Created test property: ${dominionLeadId}`);
  }

  // 2. Count property_contacts before skip trace
  const beforeContacts = await db
    .select({ id: propertyContacts.id, phone: propertyContacts.phone, email: propertyContacts.email })
    .from(propertyContacts)
    .where(eq(propertyContacts.dominionLeadId, dominionLeadId));
  const beforeCount = beforeContacts.length;

  console.log(`   Step 2: Calling skip trace service (STANDARD tier, Tracerfy)...`);
  console.log(`   (Polling is built into the service; may take up to ~3 min)\n`);

  // 3. Call skip trace — same as API endpoint; polling happens inside
  const result = await skipTraceProperty(dominionLeadId, 'STANDARD');

  // 4. Count property_contacts after
  const afterContacts = await db
    .select({
      id: propertyContacts.id,
      phone: propertyContacts.phone,
      email: propertyContacts.email,
      contactType: propertyContacts.contactType,
      source: propertyContacts.source,
    })
    .from(propertyContacts)
    .where(eq(propertyContacts.dominionLeadId, dominionLeadId));
  const afterCount = afterContacts.length;
  const newCount = afterCount - beforeCount;

  const phones = afterContacts.map((c) => c.phone).filter((p): p is string => !!p);
  const emails = afterContacts.map((c) => c.email).filter((e): e is string => !!e);
  const uniquePhones = [...new Set(phones)];
  const uniqueEmails = [...new Set(emails)];

  // 5. Print result
  console.log('   Step 3: Checking property_contacts...\n');
  console.log('   ─────────────────────────────────────────');
  console.log(`   Skip trace success:     ${result.success}`);
  console.log(`   Source:                 ${result.source}`);
  console.log(`   Cost (cents):           ${result.costCents}`);
  if (result.error) console.log(`   Error:                  ${result.error}`);
  console.log(`   property_contacts:      ${beforeCount} → ${afterCount} (${newCount} new)`);
  console.log(`   Phones:                 ${uniquePhones.length}`);
  console.log(`   Emails:                 ${uniqueEmails.length}`);
  console.log('   ─────────────────────────────────────────');

  if (uniquePhones.length > 0 || uniqueEmails.length > 0) {
    console.log('\n   Example values (masked):');
    uniquePhones.slice(0, 3).forEach((p, i) => {
      console.log(`     Phone ${i + 1}: ${maskPhone(p)}`);
    });
    uniqueEmails.slice(0, 3).forEach((e, i) => {
      console.log(`     Email ${i + 1}: ${maskEmail(e)}`);
    });
  }

  const passed =
    result.success &&
    newCount > 0 &&
    (uniquePhones.length > 0 || uniqueEmails.length > 0);

  if (passed) {
    console.log('\n   ✅ PASS — Skip trace completed; property_contacts has new rows.\n');
    process.exit(0);
  }

  console.log('\n   ❌ FAIL — No new phones/emails in property_contacts.');
  if (result.error) {
    console.log(`      Error: ${result.error}`);
  }
  if (newCount === 0 && result.success) {
    console.log('      (Skip trace reported success but no new contacts were inserted.)');
  }
  if (!result.success) {
    console.log('      (Skip trace did not succeed — check TRACERFY_API_KEY and address data.)');
  }
  console.log('');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
