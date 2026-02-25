import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

async function resetPassword() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcrypt.hash('Dominion2026!', 12);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE role = $2 RETURNING email`,
    [hash, 'ADMIN']
  );
  console.log('Password reset for:', res.rows);
  await pool.end();
  process.exit(0);
}

resetPassword();
