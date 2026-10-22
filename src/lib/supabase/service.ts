import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Architecture Rule 6: Never import in client code.
if (typeof window !== 'undefined') {
  throw new Error('Security Violation: Supabase service role client cannot be loaded in client code.');
}

/**
 * Service role client.
 * ONLY imported by: outbox processing, push registration, staff-account creation, purge.
 */
export function createServiceClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
