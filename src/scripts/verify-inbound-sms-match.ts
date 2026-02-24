#!/usr/bin/env npx tsx
/**
 * Verification: inbound SMS matches property_contacts when properties.phone is null
 *
 * Run: npm run verify:inbound-sms
 *
 * Seeds: property with phone=null, property_contact with phone.
 * Simulates Twilio inbound payload → logInboundSms → asserts correct dominionLeadId.
 */
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/index.js';
import { generateId } from '../lib/ids.js';
import { logInboundSms } from '../modules/dialer/sms-service.js';

const env = process.env;
const DATABASE_URL = env.DATABASE_URL || env.TEST_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL or TEST_DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const db = drizzle(pool, { schema });
const { properties, propertyContacts, smsLogs } = schema;

const TEST_PHONE = '+15551234567';
const TEST_COUNTY = 'SmsVerifyCounty';

async function main() {
  console.log('\n🔬 Inbound SMS match verification: property_contacts fallback\n');

  // Clean prior run
  const [existing] = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties)
    .where(eq(properties.county, TEST_COUNTY))
    .limit(1);

  if (existing) {
    await db.delete(propertyContacts).where(eq(propertyContacts.dominionLeadId, existing.dominionLeadId));
    await db.delete(smsLogs).where(eq(smsLogs.dominionLeadId, existing.dominionLeadId));
    await db.delete(properties).where(eq(properties.dominionLeadId, existing.dominionLeadId));
  }

  // Seed: property with phone=null, contact with phone
  const dominionLeadId = generateId();
  await db.insert(properties).values({
    dominionLeadId,
    propertyId: generateId(),
    apn: 'SMS-VERIFY-001',
    county: TEST_COUNTY,
    state: 'AZ',
    phone: null, // No property-level phone
  });

  await db.insert(propertyContacts).values({
    dominionLeadId,
    contactType: 'OWNER',
    phone: TEST_PHONE,
    isPrimary: true,
  });

  // Simulate inbound Twilio payload
  const { dominionLeadId: matched } = await logInboundSms(
    TEST_PHONE,
    '+15559876543',
    'Test reply',
    `SM${generateId().replace(/-/g, '').slice(0, 32)}`,
  );

  if (matched === dominionLeadId) {
    console.log('   ✅ properties.phone=null, property_contacts has number → correct lead matched\n');
  } else {
    console.error(`   ❌ Expected dominionLeadId ${dominionLeadId}, got ${matched}\n`);
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end().then(() => process.exit(1));
});
