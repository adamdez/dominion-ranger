import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(20),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Server
  PORT: z.coerce.number().default(3100),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Provider API Keys
  REGRID_API_KEY: z.string().optional(),
  PROPERTY_RADAR_API_KEY: z.string().optional(),
  FORECLOSURE_RADAR_API_KEY: z.string().optional(),
  REISKIP_API_KEY: z.string().optional(),
  TRACERFY_API_KEY: z.string().optional(),
  BATCHDATA_API_KEY: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(32).default('dominion-ranger-dev-jwt-secret-32chars!'),
  ADMIN_BOOTSTRAP_TOKEN: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_TWIML_APP_SID: z.string().optional(),
  TWILIO_API_KEY: z.string().optional(),
  TWILIO_API_SECRET: z.string().optional(),

  // Public URL for webhooks (validated at runtime, not on startup)
  BASE_URL: z.string().optional().transform(v => (v && v.trim() ? v.trim() : undefined)),

  // Auto-pipeline (disabled by default — enable explicitly)
  AUTO_PIPELINE_ENABLED: z.coerce.boolean().default(false),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
