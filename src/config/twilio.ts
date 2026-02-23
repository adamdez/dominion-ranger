import twilio from 'twilio';
import { env } from './env.js';

const TWILIO_CONFIGURED = !!(
  env.TWILIO_ACCOUNT_SID &&
  env.TWILIO_AUTH_TOKEN &&
  env.TWILIO_PHONE_NUMBER
);

const CLIENT_CONFIGURED = !!(
  TWILIO_CONFIGURED &&
  env.TWILIO_API_KEY &&
  env.TWILIO_API_SECRET &&
  env.TWILIO_TWIML_APP_SID
);

let twilioClient: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio {
  if (!TWILIO_CONFIGURED) {
    throw new Error(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.',
    );
  }
  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
  }
  return twilioClient;
}

export function isTwilioConfigured(): boolean {
  return TWILIO_CONFIGURED;
}

export function isClientConfigured(): boolean {
  return CLIENT_CONFIGURED;
}

export const TWILIO_PHONE_NUMBER = env.TWILIO_PHONE_NUMBER ?? '';
