/**
 * Bootstrap First Dial — Full pipeline without Redis
 *
 * Runs the complete flow: CSV import → distress events → scoring → promotion
 * → lead instance → claim → compliance → DIAL_READY.
 *
 * Usage: npm run bootstrap:first-dial [filename.csv]
 *   If no filename, uses newest CSV in ./data/imports
 *
 * Idempotent: re-running reuses existing properties/events/leads.
 */

import 'dotenv/config';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runReimportCsv } from './reimport-csv.js';
import { wireEventHandlers } from '../events/wiring.js';
import { scoreProperty } from '../modules/scoring/index.js';
import { evaluateForPromotion } from '../modules/promotion/index.js';
import {
  claimLead,
  runComplianceGating,
  getLeadsByStatus,
} from '../modules/workflow/index.js';
import { getCallablePhone } from '../modules/dialer/index.js';
import { db } from '../db/connection.js';
import { properties, distressEvents, scoringRecords, promotedLeads, leadInstances, users } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { LeadStatus } from '../db/schema/index.js';

const IMPORT_DIR = './data/imports';
const BOOTSTRAP_USER = process.env.BOOTSTRAP_USER_ID ?? 'bootstrap-script';

async function ensureBootstrapUser(): Promise<void> {
  await db
    .insert(users)
    .values({
      userId: BOOTSTRAP_USER,
      email: `${BOOTSTRAP_USER}@dominion.local`,
      name: 'Bootstrap Script',
      role: 'ADMIN',
    })
    .onConflictDoNothing({ target: users.userId });
}
const BATCH_SIZE = 50;

async function getNewestCsv(dir: string): Promise<string | null> {
  const files = await readdir(dir);
  const csvs = files.filter((f) => f.toLowerCase().endsWith('.csv'));
  if (csvs.length === 0) return null;

  let newest: { name: string; mtime: number } | null = null;
  for (const name of csvs) {
    const statResult = await stat(join(dir, name));
    if (!newest || statResult.mtimeMs > newest.mtime) {
      newest = { name, mtime: statResult.mtimeMs };
    }
  }
  return newest ? join(dir, newest.name) : null;
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Dominion Ranger — Bootstrap First Dial (no Redis)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const fileArg = process.argv[2];
  let filePath: string;

  if (fileArg) {
    filePath = fileArg.includes('/') || fileArg.includes('\\')
      ? fileArg
      : join(IMPORT_DIR, fileArg);
  } else {
    const newest = await getNewestCsv(IMPORT_DIR);
    if (!newest) {
      console.error('No CSV files in ./data/imports. Add a CSV or pass a path.');
      process.exit(1);
    }
    filePath = newest;
    console.log(`📂 Using newest file: ${filePath}\n`);
  }

  // Step 0: Ensure bootstrap user exists (for claim FK)
  await ensureBootstrapUser();
  console.log('✓ Bootstrap user ready\n');

  // Step 1: Wire event handlers (lead.promoted → createLeadInstance)
  wireEventHandlers();
  console.log('✓ Event handlers wired\n');

  // Step 2: Import CSV (properties + distress_events)
  console.log('── Step 1: CSV Import ─────────────────────────────────────');
  const importResult = await runReimportCsv(filePath);
  console.log(`   Properties touched: ${importResult.created + importResult.updated}`);
  console.log(`   Distress events: ${importResult.eventsCreated}`);
  console.log(`   Dominion lead IDs: ${importResult.dominionLeadIds.length}\n`);

  if (importResult.dominionLeadIds.length === 0) {
    console.error('No properties imported. Check CSV format and path.');
    process.exit(1);
  }

  // Step 3: Batch scoring
  console.log('── Step 2: Scoring ────────────────────────────────────────');
  let scored = 0;
  for (let i = 0; i < importResult.dominionLeadIds.length; i += BATCH_SIZE) {
    const chunk = importResult.dominionLeadIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (id: string) => {
        try {
          await scoreProperty(id);
          scored++;
        } catch (err) {
          console.error(`   Score failed ${id}:`, err instanceof Error ? err.message : err);
        }
      }),
    );
    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= importResult.dominionLeadIds.length) {
      console.log(`   Scored: ${Math.min(i + BATCH_SIZE, importResult.dominionLeadIds.length)} / ${importResult.dominionLeadIds.length}`);
    }
  }
  console.log(`   Total scored: ${scored}\n`);

  // Step 4: Promotion (emits lead.promoted → createLeadInstance)
  console.log('── Step 3: Promotion ───────────────────────────────────────');
  let promoted = 0;
  for (const dominionLeadId of importResult.dominionLeadIds) {
    try {
      const scoringResult = await scoreProperty(dominionLeadId);
      const promo = await evaluateForPromotion(dominionLeadId, scoringResult);
      if (promo) promoted++;
    } catch (err) {
      if (err instanceof Error && err.message.includes('already promoted')) {
        promoted++;
      }
    }
  }
  // Allow event handlers to complete
  await new Promise((r) => setTimeout(r, 200));
  console.log(`   Promoted: ${promoted}\n`);

  // Step 5: Find one lead to claim (PROMOTED or already ASSIGNED/DIAL_READY)
  console.log('── Step 4: Claim + Compliance → DIAL_READY ─────────────────');
  const promotedLeadsList = await getLeadsByStatus(LeadStatus.PROMOTED);
  const assignedOrReady = await getLeadsByStatus(LeadStatus.ASSIGNED);
  const dialReady = await getLeadsByStatus(LeadStatus.DIAL_READY);

  const toClaim = promotedLeadsList[0];
  const alreadyReady = dialReady[0];
  const alreadyAssigned = assignedOrReady[0];

  let leadInstanceId: string | null = null;
  let dominionLeadId: string | null = null;

  if (alreadyReady) {
    leadInstanceId = alreadyReady.leadInstanceId;
    dominionLeadId = alreadyReady.dominionLeadId;
    console.log(`   Found existing DIAL_READY lead: ${leadInstanceId}`);
  } else if (alreadyAssigned) {
    const afterCompliance = await runComplianceGating(alreadyAssigned.leadInstanceId);
    leadInstanceId = afterCompliance.leadInstanceId;
    dominionLeadId = afterCompliance.dominionLeadId;
    console.log(`   Ran compliance on ASSIGNED lead → ${afterCompliance.status}`);
  } else if (toClaim) {
    const claimed = await claimLead({
      leadInstanceId: toClaim.leadInstanceId,
      userId: BOOTSTRAP_USER,
      expectedVersion: toClaim.version,
    });
    const afterCompliance = await runComplianceGating(claimed.leadInstanceId);
    leadInstanceId = afterCompliance.leadInstanceId;
    dominionLeadId = afterCompliance.dominionLeadId;
    console.log(`   Claimed + compliance → ${afterCompliance.status}`);
  } else {
    console.error('   No promoted leads to claim. Ensure scoring config and promotion threshold allow at least one lead.');
    process.exit(1);
  }

  const callablePhone = dominionLeadId ? await getCallablePhone(dominionLeadId) : null;

  // Step 6: Final counts and output
  const [propCount] = await db.select({ count: sql<number>`count(*)::int` }).from(properties);
  const [eventCount] = await db.select({ count: sql<number>`count(*)::int` }).from(distressEvents);
  const [scoreCount] = await db.select({ count: sql<number>`count(*)::int` }).from(scoringRecords);
  const [promoCount] = await db.select({ count: sql<number>`count(*)::int` }).from(promotedLeads);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   BOOTSTRAP SUCCESS                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`   property count:        ${propCount?.count ?? 0}`);
  console.log(`   distress_event count:   ${eventCount?.count ?? 0}`);
  console.log(`   scoring_record count:   ${scoreCount?.count ?? 0}`);
  console.log(`   promoted_lead count:   ${promoCount?.count ?? 0}`);
  console.log(`   lead_instance_id:       ${leadInstanceId}`);
  console.log(`   dominion_lead_id:       ${dominionLeadId}`);
  console.log(`   callable phone:         ${callablePhone ?? '(none)'}`);

  if (!callablePhone) {
    console.log('\n   ⚠ No callable phone found; add property_contacts or property.phone, then rerun.');
  } else {
    console.log('\n   ✓ Ready to dial. Use GET /api/dial-queue and place a call.');
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
