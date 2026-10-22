import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { maskPhone } from '@/features/queue/schemas';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(
  { role: 'staff' },
  async (_request, { params, profile, supabase }) => {
    if (!profile.org_id) {
      throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
    }

    const queueId = params?.id;
    if (!queueId) {
      throw new AppError('NOT_FOUND', 404, 'Queue not found');
    }

    // 1. Verify queue ownership
    const { data: queue, error: queueError } = await supabase
      .from('queues')
      .select('id, org_id, name, default_service_minutes, is_active')
      .eq('id', queueId)
      .eq('org_id', profile.org_id)
      .maybeSingle();

    if (queueError || !queue) {
      throw new AppError('NOT_FOUND', 404, 'Queue not found');
    }

    // 2. Fetch current queue_state
    const { data: state, error: stateError } = await supabase
      .from('queue_state')
      .select('*')
      .eq('queue_id', queueId)
      .single();

    if (stateError || !state) {
      throw new AppError('NOT_FOUND', 404, 'Queue state not found');
    }

    // 3. Fetch currently serving token (if any)
    const { data: servingToken, error: servingError } = await supabase
      .from('tokens')
      .select('id, number, status, called_at, phone, public_code')
      .eq('queue_id', queueId)
      .eq('service_date', state.service_date)
      .eq('status', 'serving')
      .maybeSingle();

    if (servingError) {
      throw new AppError('INTERNAL', 500, servingError.message);
    }

    // 4. Fetch next 5 waiting tokens
    const { data: waitingTokens, error: waitingError } = await supabase
      .from('tokens')
      .select('id, number, status, issued_at, phone, public_code')
      .eq('queue_id', queueId)
      .eq('service_date', state.service_date)
      .eq('status', 'waiting')
      .order('number', { ascending: true })
      .limit(5);

    if (waitingError) {
      throw new AppError('INTERNAL', 500, waitingError.message);
    }

    // 5. Fetch all tokens today for aggregate counts
    const { data: allTodayTokens, error: countsError } = await supabase
      .from('tokens')
      .select('status')
      .eq('queue_id', queueId)
      .eq('service_date', state.service_date);

    if (countsError) {
      throw new AppError('INTERNAL', 500, countsError.message);
    }

    const counts = {
      total: allTodayTokens?.length ?? 0,
      waiting: allTodayTokens?.filter((t) => t.status === 'waiting').length ?? 0,
      serving: allTodayTokens?.filter((t) => t.status === 'serving').length ?? 0,
      completed: allTodayTokens?.filter((t) => t.status === 'completed').length ?? 0,
      skipped: allTodayTokens?.filter((t) => t.status === 'skipped').length ?? 0,
      cancelled: allTodayTokens?.filter((t) => t.status === 'cancelled').length ?? 0,
    };

    // 6. Fetch skipped tokens today for recall action (F-11)
    const { data: skippedTokens } = await supabase
      .from('tokens')
      .select('id, number, status, phone, public_code')
      .eq('queue_id', queueId)
      .eq('service_date', state.service_date)
      .eq('status', 'skipped')
      .order('number', { ascending: false });

    const { data: recallAudit } = await supabase
      .from('audit_events')
      .select('token_id')
      .eq('queue_id', queueId)
      .eq('action', 'recall');

    const recalledTokenIds = new Set((recallAudit || []).map((a) => a.token_id));

    const maskedSkipped = (skippedTokens || []).map((t) => ({
      ...t,
      phone: maskPhone(t.phone),
      can_recall: !recalledTokenIds.has(t.id),
    }));

    return NextResponse.json({
      queue,
      state,
      serving: maskedServing,
      next_waiting: maskedWaiting,
      skipped: maskedSkipped,
      counts,
    });
  },
);
