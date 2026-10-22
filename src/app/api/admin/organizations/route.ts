import { NextResponse } from 'next/server';
import { withAuth, AppError } from '@/lib/http';
import { createOrganizationSchema } from '@/features/admin/schemas';

export const dynamic = 'force-dynamic';

export const GET = withAuth({ role: 'admin' }, async (_request, { supabase }) => {
  const { data: organizations, error } = await supabase
    .from('organizations')
    .select('id, name, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError('INTERNAL', 500, error.message);
  }

  return NextResponse.json({ organizations });
});

export const POST = withAuth({ role: 'admin' }, async (request, { supabase }) => {
  const body = await request.json();
  const parsed = createOrganizationSchema.parse(body);

  // Check duplicate organization name
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', parsed.name)
    .maybeSingle();

  if (existing) {
    throw new AppError('DUPLICATE_NAME', 409, 'Organization name is already in use');
  }

  const { data: organization, error } = await supabase
    .from('organizations')
    .insert({
      name: parsed.name,
      is_active: true,
    })
    .select('id, name, is_active, created_at')
    .single();

  if (error) {
    throw new AppError('INTERNAL', 500, error.message);
  }

  return NextResponse.json({ organization }, { status: 201 });
});
