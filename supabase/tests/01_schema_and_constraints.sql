-- pgTAP Test Suite 01: Schema and Constraints
-- Blueprint Section 14

BEGIN;
SELECT plan(18);

-- 1. Table existence checks (8 tables)
SELECT has_table('public', 'organizations', 'organizations table exists');
SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_table('public', 'queues', 'queues table exists');
SELECT has_table('public', 'queue_state', 'queue_state table exists');
SELECT has_table('public', 'tokens', 'tokens table exists');
SELECT has_table('public', 'push_subscriptions', 'push_subscriptions table exists');
SELECT has_table('public', 'notification_outbox', 'notification_outbox table exists');
SELECT has_table('public', 'audit_events', 'audit_events table exists');

-- Test Setup IDs
SELECT tests.create_supabase_user('test-admin-1', 'admin1@test.local') \gset
SELECT tests.create_supabase_user('test-staff-1', 'staff1@test.local') \gset

-- 2. Constraints: Staff profile without organization must fail
SELECT throws_ok(
    $$ INSERT INTO public.profiles (id, role, org_id, full_name)
       VALUES ('test-staff-1', 'staff', NULL, 'Staff With No Org') $$,
    '23514', -- check_violation
    NULL,
    'Staff profile without organization is rejected'
);

-- 3. Constraints: Admin profile with organization must fail
SELECT throws_ok(
    $$ INSERT INTO public.profiles (id, role, org_id, full_name)
       VALUES ('test-admin-1', 'admin', 'a0000000-0000-0000-0000-000000000001', 'Admin With Org') $$,
    '23514', -- check_violation
    NULL,
    'Admin profile with organization is rejected'
);

-- 4. Constraints: Invalid phone format rejected
SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, phone, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 999, '1234567890123456789012', '01712345678', gen_random_uuid()) $$,
    '23514',
    NULL,
    'Token with non-international phone format is rejected'
);

-- 5. Constraints: Invalid token status rejected
SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 999, '1234567890123456789012', 'in_progress', gen_random_uuid()) $$,
    '23514',
    NULL,
    'Token with invalid status is rejected'
);

-- 6. Constraints: Token serving requires called_at
SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, called_at, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 999, '1234567890123456789012', 'serving', NULL, gen_random_uuid()) $$,
    '23514',
    NULL,
    'Serving token without called_at is rejected'
);

-- 7. Constraints: Token completed requires service_seconds
SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, service_seconds, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 999, '1234567890123456789012', 'completed', NULL, gen_random_uuid()) $$,
    '23514',
    NULL,
    'Completed token without service_seconds is rejected'
);

-- 8. Constraints: Duplicate queue name in same organization is rejected
SELECT throws_ok(
    $$ INSERT INTO public.queues (org_id, name, default_service_minutes)
       VALUES ('a0000000-0000-0000-0000-000000000001', 'General Medicine', 10) $$,
    '23505', -- unique_violation
    NULL,
    'Duplicate queue name in same organization is rejected'
);

-- 9. Constraints: Duplicate (queue_id, service_date, number) is rejected
INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, phone, request_id)
VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 100, 'code123456789012345678', 'waiting', '+8801712345678', 'c0000000-0000-0000-0000-000000000001');

SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 100, 'code123456789012345679', 'waiting', 'c0000000-0000-0000-0000-000000000002') $$,
    '23505',
    NULL,
    'Duplicate (queue, date, number) is rejected'
);

-- 10. Constraints: Duplicate request_id for same queue is rejected
SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 101, 'code123456789012345679', 'waiting', 'c0000000-0000-0000-0000-000000000001') $$,
    '23505',
    NULL,
    'Duplicate request_id in same queue is rejected'
);

-- Finish tests
SELECT * FROM finish();
ROLLBACK;
