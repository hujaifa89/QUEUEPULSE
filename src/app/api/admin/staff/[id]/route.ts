import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { updateStaffSchema } from '@/features/admin/schemas';

export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(
  { role: 'admin' },
  async (request, { params, supabase }) => {
    const staffId = params?.id;
    if (!staffId) {
      throw new AppError('NOT_FOUND', 404, 'Staff account not found');
    }

    const body = await request.json();
    const parsed = updateStaffSchema.parse(body);

    // Verify staff exists and is staff role
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', staffId)
      .maybeSingle();

    if (findError || !existing || existing.role !== 'staff') {
      throw new AppError('NOT_FOUND', 404, 'Staff account not found');
    }

    // If changing organization, check that organization exists
    if (parsed.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, is_active')
        .eq('id', parsed.organization_id)
        .maybeSingle();

      if (!org) {
        throw new AppError('NOT_FOUND', 404, 'Target organization not found');
      }
      if (!org.is_active) {
        throw new AppError('FORBIDDEN', 403, 'Target organization is inactive');
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.full_name !== undefined) updatePayload.full_name = parsed.full_name;
    if (parsed.is_active !== undefined) updatePayload.is_active = parsed.is_active;
    if (parsed.organization_id !== undefined) updatePayload.org_id = parsed.organization_id;

    const { data: updatedStaff, error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', staffId)
      .select('id, role, org_id, full_name, is_active, created_at')
      .single();

    if (updateError) {
      throw new AppError('INTERNAL', 500, updateError.message);
    }

    return NextResponse.json({ staff: updatedStaff });
  },
);
