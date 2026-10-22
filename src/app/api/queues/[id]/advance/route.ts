import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { advanceQueueSchema } from '@/features/queue/schemas';
import { mapDatabaseError } from '@/features/queue/errorMap';
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
    const parsed = advanceQueueSchema.parse(body);

    // Call atomic advance_queue function in PostgreSQL
    const { data, error } = await supabase.rpc('advance_queue', {
      p_queue_id: queueId,
      p_action: parsed.action,
      p_expected_serving_token_id: parsed.expected_serving_token_id ?? null,
    });

    if (error) {
      const errMsg = error.message || '';

      // Special handling for STALE_STATE: include current queue_state
      if (errMsg.includes('STALE_STATE')) {
        const { data: currentState } = await supabase
          .from('queue_state')
          .select('*')
          .eq('queue_id', queueId)
          .maybeSingle();

        return NextResponse.json(
          {
            error: {
              code: 'STALE_STATE',
              message: 'Someone already advanced the queue',
              requestId: meta.requestId,
            },
            state: currentState,
          },
          { status: 409 },
        );
      }

      throw mapDatabaseError(error);
    }

    // Trigger asynchronous outbox processing after commit (requirement 6)
    processOutbox(queueId).catch((err) => {
      console.error(`[Outbox] Processing failed for queue ${queueId} [requestId: ${meta.requestId}]:`, err);
    });

    return NextResponse.json({ state: data });
  },
);

