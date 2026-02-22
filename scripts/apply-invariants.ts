import 'dotenv/config';
import { applyAppendOnlyInvariants } from '../src/db/invariants.js';

async function main(): Promise<void> {
  await applyAppendOnlyInvariants();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to apply invariants:', err);
  process.exit(1);
});
