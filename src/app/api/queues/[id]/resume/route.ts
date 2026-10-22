import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { mapDatabaseError } from '@/features/queue/errorMap';

export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(
  { role: 'staff' },
  async (_request, { params, profile, supabase }) => {
    if (!profile.org_id) {
      throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
    }

    const queueId = params?.id;
    if (!queueId) {
      throw new AppError('NOT_FOUND', 404, 'Queue not found');
    }

    const { data, error } = await supabase.rpc('resume_queue', {
      p_queue_id: queueId,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    return NextResponse.json({ state: data });
  },
);
