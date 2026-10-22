-- pgTAP Test Suite 04: Admin Overview Function
-- Blueprint Section 15 & Phase 4

BEGIN;
SELECT plan(4);

-- Setup test users
SELECT tests.create_supabase_user('admin-overview-test', 'admin_ov@test.local') \gset
SELECT tests.create_supabase_user('staff-overview-test', 'staff_ov@test.local') \gset

INSERT INTO public.profiles (id, role, org_id, full_name, is_active)
VALUES 
    ('admin-overview-test', 'admin', NULL, 'Test Admin', true),
    ('staff-overview-test', 'staff', 'a0000000-0000-0000-0000-000000000001', 'Test Staff', true)
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- 1. Test Admin Execution
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "admin-overview-test", "role": "authenticated"}';

SELECT lives_ok(
    $$ SELECT * FROM public.admin_overview() $$,
    'admin can execute admin_overview'
);

SELECT is(
    (SELECT count(*)::integer FROM public.admin_overview()),
    1,
    'admin_overview returns exactly 1 row with counts'
);

-- 2. Staff execution rejected with FORBIDDEN
SET LOCAL "request.jwt.claims" = '{"sub": "staff-overview-test", "role": "authenticated"}';

SELECT throws_ok(
    $$ SELECT * FROM public.admin_overview() $$,
    'P0001',
    'FORBIDDEN',
    'staff caller is rejected from admin_overview with FORBIDDEN'
);

-- 3. Anon execution rejected
SET LOCAL ROLE anon;

SELECT throws_ok(
    $$ SELECT * FROM public.admin_overview() $$,
    '42501', -- permission denied
    NULL,
    'anon cannot execute admin_overview'
);

SELECT * FROM finish();
ROLLBACK;
