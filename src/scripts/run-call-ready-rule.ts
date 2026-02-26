#!/usr/bin/env npx tsx
/**
 * Run the Call-Ready rule on-demand for the last N days of leads.
 *
 * Usage:
 *   npx tsx src/scripts/run-call-ready-rule.ts [--days=7]
 *
 * Environment:
 *   CALL_READY_ENABLED — must be true (or script will no-op)
 *   CALL_READY_SCORE_THRESHOLD, CALL_READY_COOLDOWN_HOURS, CALL_READY_CLAIM_OWNED_ONLY
 */
import 'dotenv/config';
import { runCallReadyForLastNDays } from '../modules/call-ready/service.js';
import { getCallReadyConfig } from '../modules/call-ready/config.js';

const args = process.argv.slice(2);
let days = 7;
for (const arg of args) {
  if (arg.startsWith('--days=')) {
    days = parseInt(arg.split('=')[1] ?? '7', 10);
    break;
  }
}

async function main() {
  const config = getCallReadyConfig();
  if (!config.enabled) {
    console.log('Call-ready auto queue is disabled (CALL_READY_ENABLED=false). Exiting.');
    process.exit(0);
  }

  console.log(`\n📞 Call-Ready Rule — last ${days} days\n`);
  console.log(`Config: threshold=${config.scoreThreshold}, cooldown=${config.cooldownHours}h, claimOwnedOnly=${config.claimOwnedOnly}\n`);

  const result = await runCallReadyForLastNDays(days);

  console.log(`Evaluated: ${result.evaluated}`);
  console.log(`Eligible:  ${result.eligible}`);
  console.log(`Enqueued:  ${result.enqueued}`);
  console.log(`Errors:    ${result.errors}`);
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
