import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { issueTokenSchema } from '@/features/queue/schemas';
import { mapDatabaseError } from '@/features/queue/errorMap';
import { todayInDhaka } from '@/lib/time';
import { processOutbox } from '@/features/notifications/outbox';

export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(
  { role: 'staff' },
  async (request, { params, profile, supabase }, meta) => {
    if (!profile.org_id) {
      throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
    }

    const queueId = params?.id;
    if (!queueId) {
      throw new AppError('NOT_FOUND', 404, 'Queue not found');
    }

    const body = await request.json();
    const parsed = issueTokenSchema.parse(body);

    // Call atomic issue_token function in PostgreSQL
    const { data, error } = await supabase.rpc('issue_token', {
      p_queue_id: queueId,
      p_phone: parsed.phone ?? null,
      p_request_id: parsed.request_id,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    const issued = Array.isArray(data) ? data[0] : data;
    if (!issued) {
      throw new AppError('INTERNAL', 500, 'Failed to issue token');
    }

    // Fetch queue name and service date for slip rendering
    const { data: queue } = await supabase
      .from('queues')
      .select('name, queue_state(service_date)')
      .eq('id', queueId)
      .single();

    const serviceDate = Array.isArray(queue?.queue_state)
      ? (queue?.queue_state[0] as { service_date?: string } | undefined)?.service_date
      : (queue?.queue_state as unknown as { service_date?: string } | null)?.service_date;

    // Trigger asynchronous outbox processing after commit (requirement 6)
    processOutbox(queueId).catch((err) => {
      console.error(`[Outbox] Processing failed for queue ${queueId} [requestId: ${meta.requestId}]:`, err);
    });

    return NextResponse.json(
      {
        token: {
          number: issued.number,
          public_code: issued.public_code,
          status: issued.status,
          queue_name: queue?.name ?? '',
          service_date: serviceDate ?? todayInDhaka(),
        },
      },
      { status: 201 },
    );
  },
);

