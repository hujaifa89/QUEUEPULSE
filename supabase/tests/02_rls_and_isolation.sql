-- pgTAP Test Suite 02: Row Level Security, Isolation and Direct Write Prevention
-- Blueprint Section 10 (SEC-02, SEC-03) & Section 14

BEGIN;
SELECT plan(22);

-- 1. Setup Test Users
-- Create Auth Users
SELECT tests.create_supabase_user('staff-org-a', 'staff_a@test.local') \gset
SELECT tests.create_supabase_user('staff-org-b', 'staff_b@test.local') \gset
SELECT tests.create_supabase_user('staff-inactive', 'staff_inactive@test.local') \gset
SELECT tests.create_supabase_user('staff-org-inactive', 'staff_org_inactive@test.local') \gset

-- Create an Inactive Organization
INSERT INTO public.organizations (id, name, is_active)
VALUES ('a0000000-0000-0000-0000-000000000003', 'Inactive Clinic', false);

-- Insert Profiles for Test Users
INSERT INTO public.profiles (id, role, org_id, full_name, is_active)
VALUES 
    ('staff-org-a', 'staff', 'a0000000-0000-0000-0000-000000000001', 'Staff Org A', true),
    ('staff-org-b', 'staff', 'a0000000-0000-0000-0000-000000000002', 'Staff Org B', true),
    ('staff-inactive', 'staff', 'a0000000-0000-0000-0000-000000000001', 'Inactive Staff', false),
    ('staff-org-inactive', 'staff', 'a0000000-0000-0000-0000-000000000003', 'Staff Inactive Org', true);

-- Insert sample tokens for isolation checks
INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, request_id)
VALUES 
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 1, 'token00000000000000001', 'waiting', gen_random_uuid()),
    ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', CURRENT_DATE, 1, 'token00000000000000002', 'waiting', gen_random_uuid());

-- =========================================================================
-- Part A: Anonymous Access Tests (SEC-03)
-- Anon must not select or write to any table
-- =========================================================================
SET LOCAL ROLE anon;

SELECT throws_ok(
    $$ SELECT * FROM public.organizations $$,
    '42501', -- insufficient_privilege
    NULL,
    'anon cannot SELECT organizations'
);

SELECT throws_ok(
    $$ SELECT * FROM public.profiles $$,
    '42501',
    NULL,
    'anon cannot SELECT profiles'
);

SELECT throws_ok(
    $$ SELECT * FROM public.queues $$,
    '42501',
    NULL,
    'anon cannot SELECT queues'
);

SELECT throws_ok(
    $$ SELECT * FROM public.queue_state $$,
    '42501',
    NULL,
    'anon cannot SELECT queue_state'
);

SELECT throws_ok(
    $$ SELECT * FROM public.tokens $$,
    '42501',
    NULL,
    'anon cannot SELECT tokens'
);

SELECT throws_ok(
    $$ INSERT INTO public.organizations (name) VALUES ('Hacked Org') $$,
    '42501',
    NULL,
    'anon cannot INSERT organizations'
);

SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 999, 'hacked0000000000000001', gen_random_uuid()) $$,
    '42501',
    NULL,
    'anon cannot INSERT tokens'
);

-- =========================================================================
-- Part B: Tenant Isolation Tests (SEC-02, TC-05)
-- Staff of Org A cannot see queues, queue_state, or tokens of Org B
-- =========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-a", "role": "authenticated"}';

SELECT is(
    (SELECT count(*)::integer FROM public.queues WHERE org_id = 'a0000000-0000-0000-0000-000000000002'),
    0,
    'staff of Org A cannot see Org B queues'
);

SELECT is(
    (SELECT count(*)::integer FROM public.queue_state WHERE queue_id = 'b0000000-0000-0000-0000-000000000003'),
    0,
    'staff of Org A cannot see Org B queue_state'
);

SELECT is(
    (SELECT count(*)::integer FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000003'),
    0,
    'staff of Org A cannot see Org B tokens'
);

SELECT is(
    (SELECT count(*)::integer FROM public.queues WHERE org_id = 'a0000000-0000-0000-0000-000000000001'),
    2,
    'staff of Org A can see own queues'
);

-- =========================================================================
-- Part C: Inactive Staff and Staff of Inactive Organization
-- Inactive staff and staff of inactive org see nothing
-- =========================================================================
SET LOCAL "request.jwt.claims" = '{"sub": "staff-inactive", "role": "authenticated"}';

SELECT is(
    (SELECT count(*)::integer FROM public.queues),
    0,
    'inactive staff sees no queues'
);

SELECT is(
    (SELECT count(*)::integer FROM public.tokens),
    0,
    'inactive staff sees no tokens'
);

SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-inactive", "role": "authenticated"}';

SELECT is(
    (SELECT count(*)::integer FROM public.queues),
    0,
    'staff of inactive organization sees no queues'
);

SELECT is(
    (SELECT count(*)::integer FROM public.tokens),
    0,
    'staff of inactive organization sees no tokens'
);

-- =========================================================================
-- Part D: Prevention of Direct Writes (DEC-08)
-- Authenticated users cannot directly INSERT or UPDATE tokens or queue_state
-- =========================================================================
SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-a", "role": "authenticated"}';

SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 50, 'token50000000000000001', 'waiting', gen_random_uuid()) $$,
    '42501', -- RLS policy violation / permission denied
    NULL,
    'authenticated staff cannot directly INSERT into tokens'
);

SELECT throws_ok(
    $$ INSERT INTO public.queue_state (queue_id, service_date, avg_service_minutes, status)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 5.0, 'active') $$,
    '42501',
    NULL,
    'authenticated staff cannot directly INSERT into queue_state'
);

SELECT throws_ok(
    $$ UPDATE public.tokens SET status = 'serving' WHERE id = 'd0000000-0000-0000-0000-000000000001' $$,
    '42501',
    NULL,
    'authenticated staff cannot directly UPDATE tokens'
);

SELECT throws_ok(
    $$ UPDATE public.queue_state SET serving_number = 1 WHERE queue_id = 'b0000000-0000-0000-0000-000000000001' $$,
    '42501',
    NULL,
    'authenticated staff cannot directly UPDATE queue_state'
);

SELECT throws_ok(
    $$ INSERT INTO public.push_subscriptions (token_id, endpoint, p256dh, auth)
       VALUES ('d0000000-0000-0000-0000-000000000001', 'https://push.example.com', 'p256', 'auth') $$,
    '42501',
    NULL,
    'authenticated staff cannot directly INSERT into push_subscriptions'
);

SELECT throws_ok(
    $$ INSERT INTO public.notification_outbox (token_id, channel, kind, status)
       VALUES ('d0000000-0000-0000-0000-000000000001', 'sms', 'near_turn', 'pending') $$,
    '42501',
    NULL,
    'authenticated staff cannot directly INSERT into notification_outbox'
);

SELECT throws_ok(
    $$ INSERT INTO public.audit_events (queue_id, actor_id, action)
       VALUES ('b0000000-0000-0000-0000-000000000001', 'staff-org-a', 'issue') $$,
    '42501',
    NULL,
    'authenticated staff cannot directly INSERT into audit_events'
);

-- Finish tests
SELECT * FROM finish();
ROLLBACK;
