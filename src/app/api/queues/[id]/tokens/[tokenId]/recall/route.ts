import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { mapDatabaseError } from '@/features/queue/errorMap';
import { processOutbox } from '@/features/notifications/outbox';

export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string; tokenId: string }>(
  { role: 'staff' },
  async (_request, { params, profile, supabase }, meta) => {
    if (!profile.org_id) {
      throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
    }

    const queueId = params?.id;
    const tokenId = params?.tokenId;
    if (!tokenId || !queueId) {
      throw new AppError('NOT_FOUND', 404, 'Token or queue not found');
    }

    // Call atomic recall_token function in PostgreSQL (Migration 18)
    const { data, error } = await supabase.rpc('recall_token', {
      p_token_id: tokenId,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    // Trigger asynchronous outbox processing after commit
    processOutbox(queueId).catch((err) => {
      console.error(`[Outbox] Processing failed for queue ${queueId} [requestId: ${meta.requestId}]:`, err);
    });

    return NextResponse.json({ state: data });
  },
);
