import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { updateQueueSchema } from '@/features/queue/schemas';

export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(
  { role: 'staff' },
  async (request, { params, profile, supabase }) => {
    if (!profile.org_id) {
      throw new AppError('FORBIDDEN', 403, 'Staff has no organization assigned');
    }

    const queueId = params?.id;
    if (!queueId) {
      throw new AppError('NOT_FOUND', 404, 'Queue not found');
    }

    const body = await request.json();
    const parsed = updateQueueSchema.parse(body);

    // Verify queue exists and belongs to staff's organization
    const { data: existing, error: findError } = await supabase
      .from('queues')
      .select('id, org_id, name')
      .eq('id', queueId)
      .eq('org_id', profile.org_id)
      .maybeSingle();

    if (findError || !existing) {
      throw new AppError('NOT_FOUND', 404, 'Queue not found');
    }

    // If changing name, check for duplicate name in the same organization
    if (parsed.name && parsed.name !== existing.name) {
      const { data: duplicate } = await supabase
        .from('queues')
        .select('id')
        .eq('org_id', profile.org_id)
        .eq('name', parsed.name)
        .neq('id', queueId)
        .maybeSingle();

      if (duplicate) {
        throw new AppError('DUPLICATE_NAME', 409, 'A queue with this name already exists in your organization');
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.name !== undefined) updatePayload.name = parsed.name;
    if (parsed.default_service_minutes !== undefined) {
      updatePayload.default_service_minutes = parsed.default_service_minutes;
    }
    if (parsed.is_active !== undefined) updatePayload.is_active = parsed.is_active;

    const { data: queue, error: updateError } = await supabase
      .from('queues')
      .update(updatePayload)
      .eq('id', queueId)
      .eq('org_id', profile.org_id)
      .select('id, org_id, name, default_service_minutes, is_active, created_at')
      .single();

    if (updateError) {
      throw new AppError('INTERNAL', 500, updateError.message);
    }

    return NextResponse.json({ queue });
  },
);
