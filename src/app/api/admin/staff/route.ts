import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { createServiceClient } from '@/lib/supabase/service';
import { createStaffSchema } from '@/features/admin/schemas';

export const dynamic = 'force-dynamic';

export const GET = withAuth({ role: 'admin' }, async (_request, { supabase }) => {
  const { data: staffList, error } = await supabase
    .from('profiles')
    .select(`
      id,
      role,
      org_id,
      full_name,
      is_active,
      created_at,
      organizations (
        id,
        name
      )
    `)
    .eq('role', 'staff')
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError('INTERNAL', 500, error.message);
  }

  return NextResponse.json({ staff: staffList });
});

export const POST = withAuth({ role: 'admin' }, async (request, { supabase }) => {
  const body = await request.json();
  const parsed = createStaffSchema.parse(body);

  // 1. Verify organization exists and is active
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, is_active')
    .eq('id', parsed.organization_id)
    .maybeSingle();

  if (orgError || !org) {
    throw new AppError('NOT_FOUND', 404, 'Organization not found');
  }

  if (!org.is_active) {
    throw new AppError('FORBIDDEN', 403, 'Cannot add staff to an inactive organization');
  }

  // 2. Generate secure random temporary password (minimum 10 characters per SEC-01)
  const randomChars = crypto.randomBytes(8).toString('hex');
  const temporaryPassword = `Tmp@${randomChars}9!`;

  // 3. Create Auth user via service role client (DEC-12, DEC-14)
  const serviceClient = createServiceClient();

  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email: parsed.email,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message?.toLowerCase().includes('already')) {
      throw new AppError('VALIDATION_FAILED', 400, 'A user with this email already exists');
    }
    throw new AppError('VALIDATION_FAILED', 400, authError.message);
  }

  const userId = authData.user.id;

  // 4. Create profile in the same server operation
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .insert({
      id: userId,
      role: 'staff',
      org_id: parsed.organization_id,
      full_name: parsed.full_name,
      is_active: true,
    })
    .select('id, role, org_id, full_name, is_active, created_at')
    .single();

  // If profile insert fails, delete auth user to avoid orphan auth record
  if (profileError || !profile) {
    await serviceClient.auth.admin.deleteUser(userId);
    throw new AppError('INTERNAL', 500, 'Failed to create staff profile');
  }

  // 5. Return profile and temporary password ONCE to the admin (DEC-14)
  return NextResponse.json(
    {
      staff: {
        id: profile.id,
        email: authData.user.email,
        full_name: profile.full_name,
        organization_id: profile.org_id,
        is_active: profile.is_active,
        created_at: profile.created_at,
      },
      temporary_password: temporaryPassword,
    },
    { status: 201 },
  );
});
