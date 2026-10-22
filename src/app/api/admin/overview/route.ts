import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = withAuth({ role: 'admin' }, async (_request, { supabase }) => {
  const { data, error } = await supabase.rpc('admin_overview');

  if (error) {
    throw new AppError('INTERNAL', 500, error.message);
  }

  const row = data?.[0] || { organizations: 0, active_queues: 0, tokens_today: 0 };

  return NextResponse.json({
    organizations: row.organizations ?? 0,
    active_queues: row.active_queues ?? 0,
    tokens_today: row.tokens_today ?? 0,
  });
});
