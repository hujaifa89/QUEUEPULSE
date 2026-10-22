import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { updateOrganizationSchema } from '@/features/admin/schemas';

export const dynamic = 'force-dynamic';

export const PATCH = withAuth<{ id: string }>(
  { role: 'admin' },
  async (request, { params, supabase }) => {
    const orgId = params?.id;
    if (!orgId) {
      throw new AppError('NOT_FOUND', 404, 'Organization not found');
    }

    const body = await request.json();
    const parsed = updateOrganizationSchema.parse(body);

    // Verify organization exists
    const { data: existing, error: findError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .maybeSingle();

    if (findError || !existing) {
      throw new AppError('NOT_FOUND', 404, 'Organization not found');
    }

    // Check duplicate name if name is being changed
    if (parsed.name && parsed.name !== existing.name) {
      const { data: duplicate } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', parsed.name)
        .maybeSingle();

      if (duplicate) {
        throw new AppError('DUPLICATE_NAME', 409, 'Organization name is already in use');
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.name !== undefined) updatePayload.name = parsed.name;
    if (parsed.is_active !== undefined) updatePayload.is_active = parsed.is_active;

    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update(updatePayload)
      .eq('id', orgId)
      .select('id, name, is_active, created_at')
      .single();

    if (updateError) {
      throw new AppError('INTERNAL', 500, updateError.message);
    }

    return NextResponse.json({ organization: updatedOrg });
  },
);
