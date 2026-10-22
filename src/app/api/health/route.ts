import { withHttpHandler, AppError } from '@/lib/http';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint (Phase 10, Objective 3)
 * Verifies that the database is reachable (select 1 through the server client)
 * and never leaks database details or stack traces on failure (SEC-12).
 */
export const GET = withHttpHandler(async () => {
  try {
    const supabase = await createClient();

    // Verify database connectivity by calling the health_check function (SELECT 1)
    const { data, error } = await supabase.rpc('health_check');

    if (error) {
      // Check fallback probe in case migration 19 is pending
      const fallback = await supabase.rpc('get_token_view', { p_code: 'health-probe' });
      if (fallback.error) {
        console.error('[HealthCheck] Database unreachable error:', error.message);
        throw new AppError('INTERNAL', 503, 'Service Unavailable');
      }
    } else if (data !== 1) {
      console.error('[HealthCheck] Unexpected health check response:', data);
      throw new AppError('INTERNAL', 503, 'Service Unavailable');
    }

    return { status: 'ok' };
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    console.error('[HealthCheck] Internal error verifying database health:', err);
    throw new AppError('INTERNAL', 503, 'Service Unavailable');
  }
});
