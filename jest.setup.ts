// Jest setup file for QueuePulse unit tests

// Ensure crypto.randomUUID is available in test environment
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto');
  // @ts-expect-error polyfill for older or restricted test environments
  global.crypto = nodeCrypto;
}

// Default environment variables for unit tests
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_anon_key';
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'dummy_vapid_public_key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_service_role_key';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'dummy_vapid_private_key';
process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@queuepulse.local';
process.env.SMS_PROVIDER = process.env.SMS_PROVIDER || 'mock';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'dummy_cron_secret_32_characters_min';
