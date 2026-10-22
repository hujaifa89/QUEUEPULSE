import { NextResponse } from 'next/server';
import { withHttpHandler, AppError } from '@/lib/http';
import { createServiceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Internal Daily PII Purge Endpoint (DEC-16, SEC-11)
 * Scheduled via Vercel Cron daily at 04:00 UTC (Asia/Dhaka 10:00 AM).
 * Protected by CRON_SECRET header.
 */
export const POST = withHttpHandler(async (request) => {
  // Verify authorization via Bearer token or x-cron-secret header
  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');

  const expectedBearer = `Bearer ${env.CRON_SECRET}`;
  const isAuthorized =
    authHeader === expectedBearer ||
    cronSecretHeader === env.CRON_SECRET ||
    authHeader === env.CRON_SECRET;

  if (!isAuthorized) {
    throw new AppError('FORBIDDEN', 403, 'Unauthorized cron caller');
  }

  // Call purge_expired_pii() via service role client (Architecture Rule 6)
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('purge_expired_pii');

  if (error) {
    throw new AppError('INTERNAL', 500, error.message);
  }

  const result = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    success: true,
    purged: result || {
      purged_phones: 0,
      purged_subscriptions: 0,
      purged_outbox: 0,
      purged_audit_events: 0,
    },
  });
});
