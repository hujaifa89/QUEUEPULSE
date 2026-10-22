-- pgTAP Test Suite 07: Security Hardening Matrix (Phase 9)
-- Blueprint Section 10 (SEC-01 through SEC-15), Section 14 (RLS), Section 15

BEGIN;
SELECT plan(38);

-- 1. Setup Test Users
SELECT tests.create_supabase_user('staff-sec-a', 'staff_sec_a@test.local') \gset
SELECT tests.create_supabase_user('staff-sec-b', 'staff_sec_b@test.local') \gset

INSERT INTO public.profiles (id, role, org_id, full_name, is_active)
VALUES 
    ('staff-sec-a', 'staff', 'a0000000-0000-0000-0000-000000000001', 'Staff Sec A', true),
    ('staff-sec-b', 'staff', 'a0000000-0000-0000-0000-000000000002', 'Staff Sec B', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, org_id = EXCLUDED.org_id;

-- =========================================================================
-- Part 1: Function Execution Privilege Matrix (has_function_privilege)
-- Tests anon, authenticated, and service_role privileges
-- =========================================================================

-- 1.1 ANON Privileges: anon may execute ONLY get_token_view
SELECT is(
    has_function_privilege('anon', 'public.get_token_view(text)', 'EXECUTE'),
    true,
    'anon CAN execute get_token_view'
);

SELECT is(
    has_function_privilege('anon', 'public.issue_token(uuid, text, uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute issue_token'
);

SELECT is(
    has_function_privilege('anon', 'public.advance_queue(uuid, text, uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute advance_queue'
);

SELECT is(
    has_function_privilege('anon', 'public.cancel_token(uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute cancel_token'
);

SELECT is(
    has_function_privilege('anon', 'public.pause_queue(uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute pause_queue'
);

SELECT is(
    has_function_privilege('anon', 'public.resume_queue(uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute resume_queue'
);

SELECT is(
    has_function_privilege('anon', 'public.recall_token(uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute recall_token'
);

SELECT is(
    has_function_privilege('anon', 'public.report_summary(uuid, date, date)', 'EXECUTE'),
    false,
    'anon CANNOT execute report_summary'
);

SELECT is(
    has_function_privilege('anon', 'public.admin_overview()', 'EXECUTE'),
    false,
    'anon CANNOT execute admin_overview'
);

SELECT is(
    has_function_privilege('anon', 'public.register_push(text, text, text, text)', 'EXECUTE'),
    false,
    'anon CANNOT execute register_push'
);

SELECT is(
    has_function_privilege('anon', 'public.purge_expired_pii()', 'EXECUTE'),
    false,
    'anon CANNOT execute purge_expired_pii'
);

SELECT is(
    has_function_privilege('anon', 'public.roll_queue_day(uuid)', 'EXECUTE'),
    false,
    'anon CANNOT execute roll_queue_day'
);

-- 1.2 AUTHENTICATED Privileges: staff functions allowed, service-role only functions denied
SELECT is(
    has_function_privilege('authenticated', 'public.issue_token(uuid, text, uuid)', 'EXECUTE'),
    true,
    'authenticated CAN execute issue_token'
);

SELECT is(
    has_function_privilege('authenticated', 'public.advance_queue(uuid, text, uuid)', 'EXECUTE'),
    true,
    'authenticated CAN execute advance_queue'
);

SELECT is(
    has_function_privilege('authenticated', 'public.cancel_token(uuid)', 'EXECUTE'),
    true,
    'authenticated CAN execute cancel_token'
);

SELECT is(
    has_function_privilege('authenticated', 'public.pause_queue(uuid)', 'EXECUTE'),
    true,
    'authenticated CAN execute pause_queue'
);

SELECT is(
    has_function_privilege('authenticated', 'public.resume_queue(uuid)', 'EXECUTE'),
    true,
    'authenticated CAN execute resume_queue'
);

SELECT is(
    has_function_privilege('authenticated', 'public.recall_token(uuid)', 'EXECUTE'),
    true,
    'authenticated CAN execute recall_token'
);

SELECT is(
    has_function_privilege('authenticated', 'public.report_summary(uuid, date, date)', 'EXECUTE'),
    true,
    'authenticated CAN execute report_summary'
);

SELECT is(
    has_function_privilege('authenticated', 'public.register_push(text, text, text, text)', 'EXECUTE'),
    false,
    'authenticated CANNOT execute register_push (service-role only)'
);

SELECT is(
    has_function_privilege('authenticated', 'public.purge_expired_pii()', 'EXECUTE'),
    false,
    'authenticated CANNOT execute purge_expired_pii (service-role only)'
);

SELECT is(
    has_function_privilege('authenticated', 'public.roll_queue_day(uuid)', 'EXECUTE'),
    false,
    'authenticated CANNOT execute roll_queue_day (service-role only)'
);

-- 1.3 SERVICE_ROLE Privileges: service role possesses execute on maintenance & push
SELECT is(
    has_function_privilege('service_role', 'public.register_push(text, text, text, text)', 'EXECUTE'),
    true,
    'service_role CAN execute register_push'
);

SELECT is(
    has_function_privilege('service_role', 'public.purge_expired_pii()', 'EXECUTE'),
    true,
    'service_role CAN execute purge_expired_pii'
);

-- =========================================================================
-- Part 2: Table Access Isolation Loop (Anon Denied On All 8 Tables)
-- =========================================================================
SET LOCAL ROLE anon;

-- Anon cannot read or write to any table (SEC-03)
SELECT throws_ok($$ SELECT count(*) FROM public.organizations $$, '42501', NULL, 'anon SELECT organizations denied');
SELECT throws_ok($$ SELECT count(*) FROM public.profiles $$, '42501', NULL, 'anon SELECT profiles denied');
SELECT throws_ok($$ SELECT count(*) FROM public.queues $$, '42501', NULL, 'anon SELECT queues denied');
SELECT throws_ok($$ SELECT count(*) FROM public.queue_state $$, '42501', NULL, 'anon SELECT queue_state denied');
SELECT throws_ok($$ SELECT count(*) FROM public.tokens $$, '42501', NULL, 'anon SELECT tokens denied');
SELECT throws_ok($$ SELECT count(*) FROM public.push_subscriptions $$, '42501', NULL, 'anon SELECT push_subscriptions denied');
SELECT throws_ok($$ SELECT count(*) FROM public.notification_outbox $$, '42501', NULL, 'anon SELECT notification_outbox denied');
SELECT throws_ok($$ SELECT count(*) FROM public.audit_events $$, '42501', NULL, 'anon SELECT audit_events denied');

-- =========================================================================
-- Part 3: Cross-Organization Isolation Matrix (Authenticated Staff)
-- =========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-sec-a", "role": "authenticated"}';

-- Staff Org A cannot see Org B's queues (SEC-02)
SELECT is(
    (SELECT count(*)::integer FROM public.queues WHERE org_id = 'a0000000-0000-0000-0000-000000000002'),
    0,
    'RLS: staff A sees 0 queues belonging to Org B'
);

-- Staff Org A cannot see Org B's queue_state
SELECT is(
    (SELECT count(*)::integer FROM public.queue_state qs JOIN public.queues q ON q.id = qs.queue_id WHERE q.org_id = 'a0000000-0000-0000-0000-000000000002'),
    0,
    'RLS: staff A sees 0 queue_state records belonging to Org B'
);

-- Staff Org A cannot see Org B's tokens
SELECT is(
    (SELECT count(*)::integer FROM public.tokens t JOIN public.queues q ON q.id = t.queue_id WHERE q.org_id = 'a0000000-0000-0000-0000-000000000002'),
    0,
    'RLS: staff A sees 0 tokens belonging to Org B'
);

-- Staff Org A cannot see Org B's audit_events
SELECT is(
    (SELECT count(*)::integer FROM public.audit_events a JOIN public.queues q ON q.id = a.queue_id WHERE q.org_id = 'a0000000-0000-0000-0000-000000000002'),
    0,
    'RLS: staff A sees 0 audit_events belonging to Org B'
);

-- Staff Org A cannot see Org B's staff profiles
SELECT is(
    (SELECT count(*)::integer FROM public.profiles WHERE org_id = 'a0000000-0000-0000-0000-000000000002'),
    0,
    'RLS: staff A sees 0 profiles belonging to Org B'
);

-- Direct INSERT on tokens is denied even for authenticated staff (Architecture Rule 2)
SELECT throws_ok(
    $$ INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, request_id)
       VALUES ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 999, 'direct-write-attempt0', 'waiting', gen_random_uuid()) $$,
    '42501',
    NULL,
    'Architecture Rule 2: Direct INSERT on tokens is denied by RLS'
);

SELECT * FROM finish();
ROLLBACK;
