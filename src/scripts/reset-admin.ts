/**
 * Reset admin user password.
 * Usage: npx tsx src/scripts/reset-admin.ts
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

const PASSWORD = 'Dominion2026!';
const EMAIL = 'adam@dominionhomedeals.com';

async function resetAdmin() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  const result = await db
    .update(users)
    .set({
      email: EMAIL,
      passwordHash: hash,
      updatedAt: new Date(),
    })
    .where(eq(users.role, 'ADMIN'))
    .returning({ userId: users.userId, email: users.email });

  if (result.length === 0) {
    console.error('No ADMIN user found. Create one first.');
    process.exit(1);
  }

  const updated = result[0];
  const verified = await bcrypt.compare(PASSWORD, hash);

  console.log('Admin reset:', updated.email);
  console.log('Hash verifies:', verified ? 'yes' : 'NO');
  process.exit(verified ? 0 : 1);
}

resetAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
