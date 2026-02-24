import { createUser } from '../modules/auth/auth-service.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../modules/auth/auth-service.js';

async function seedAdmin() {
  try {
    // If the old email exists, update it
    await db.update(users)
      .set({ email: 'adam@dominionhomedeals.com' })
      .where(eq(users.email, 'adam@dominionhomes.com'));

    const [existing] = await db.select().from(users).where(eq(users.email, 'adam@dominionhomedeals.com')).limit(1);
    if (existing) {
      if (!existing.passwordHash) {
        const hash = await hashPassword('changeme123');
        await db.update(users)
          .set({ passwordHash: hash, role: 'ADMIN', name: 'Adam DesJardin', phone: '5093090434', updatedAt: new Date() })
          .where(eq(users.userId, existing.userId));
        console.log('Admin user updated with password hash:', existing.email);
      } else {
        console.log('Admin user already exists with password:', existing.email);
      }
    } else {
      const admin = await createUser({ email: 'adam@dominionhomedeals.com', password: 'changeme123', name: 'Adam DesJardin', role: 'ADMIN', phone: '5093090434' });
      console.log('Admin user created:', admin.email);
    }
  } catch (err: unknown) {
    console.error('Failed to seed admin:', err);
  }
  process.exit(0);
}

seedAdmin();
