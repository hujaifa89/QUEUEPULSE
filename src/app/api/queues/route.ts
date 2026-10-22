import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { createQueueSchema } from '@/features/queue/schemas';

export const dynamic = 'force-dynamic';

export const GET = withAuth({ role: 'staff' }, async (_request, { profile, supabase }) => {
  if (!profile.org_id) {
    throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
  }

  const { data: queues, error } = await supabase
    .from('queues')
    .select(`
      id,
      org_id,
      name,
      default_service_minutes,
      is_active,
      created_at,
      queue_state (
        service_date,
        serving_number,
        last_issued,
        waiting_numbers,
        avg_service_minutes,
        status,
        version
      )
    `)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError('INTERNAL', 500, error.message);
  }

  const formattedQueues = (queues || []).map((q) => ({
    ...q,
    queue_state: Array.isArray(q.queue_state) ? q.queue_state[0] ?? null : q.queue_state ?? null,
  }));

  return NextResponse.json({ queues: formattedQueues });
});

export const POST = withAuth({ role: 'staff' }, async (request, { profile, supabase }) => {
  if (!profile.org_id) {
    throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
  }

  const body = await request.json();
  const parsed = createQueueSchema.parse(body);

  // Check duplicate queue name within staff's organization
  const { data: existing } = await supabase
    .from('queues')
    .select('id')
    .eq('org_id', profile.org_id)
    .eq('name', parsed.name)
    .maybeSingle();

  if (existing) {
    throw new AppError('DUPLICATE_NAME', 409, 'A queue with this name already exists in your organization');
  }

  // Insert queue (AFTER INSERT trigger on queues automatically initializes queue_state)
  const { data: queue, error: insertError } = await supabase
    .from('queues')
    .insert({
      org_id: profile.org_id,
      name: parsed.name,
      default_service_minutes: parsed.default_service_minutes,
      is_active: true,
    })
    .select('id, org_id, name, default_service_minutes, is_active, created_at')
    .single();

  if (insertError) {
    throw new AppError('INTERNAL', 500, insertError.message);
  }

  return NextResponse.json({ queue }, { status: 201 });
});

