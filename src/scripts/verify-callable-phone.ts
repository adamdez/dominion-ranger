#!/usr/bin/env npx tsx
/**
 * Verify getCallablePhone fallback: property with no phone + property_contact with phone → returns it.
 *
 * Run: npm run verify:callable-phone
 * Requires: DATABASE_URL
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { properties, propertyContacts } from '../db/schema/index.js';
import { getCallablePhone } from '../modules/dialer/call-service.js';
import { generateId } from '../lib/ids.js';

const TEST_ID = '00000000-0000-0000-0000-00000000cafe';
const TEST_PHONE = '5095550199';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL');
    process.exit(1);
  }

  console.log('\n🔬 Verify getCallablePhone fallback\n');

  await db.execute(sql`DELETE FROM property_contacts WHERE dominion_lead_id = ${TEST_ID}`);
  await db.execute(sql`DELETE FROM properties WHERE dominion_lead_id = ${TEST_ID}`);

  await db.insert(properties).values({
    dominionLeadId: TEST_ID,
    propertyId: generateId(),
    apn: 'VERIFY-CALLABLE',
    county: 'SPOKANE',
    state: 'WA',
    streetAddress: '999 Verify St',
    phone: null,
  });

  await db.insert(propertyContacts).values({
    dominionLeadId: TEST_ID,
    contactName: 'Test Owner',
    contactType: 'OWNER',
    phone: TEST_PHONE,
    phoneType: 'mobile',
    dndCalls: false,
    isPrimary: true,
  });

  const result = await getCallablePhone(TEST_ID);

  await db.execute(sql`DELETE FROM property_contacts WHERE dominion_lead_id = ${TEST_ID}`);
  await db.execute(sql`DELETE FROM properties WHERE dominion_lead_id = ${TEST_ID}`);

  if (result === TEST_PHONE) {
    console.log('✅ getCallablePhone returned property_contacts phone when properties.phone is null');
    process.exit(0);
  }
  console.error(`❌ Expected "${TEST_PHONE}", got ${result ?? 'null'}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
