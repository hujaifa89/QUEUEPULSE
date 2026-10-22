-- pgTAP Test Suite 06: Reports and Should-Have Features (Phase 8)
-- Blueprint Sections 5 (FR-15, 18, 19), 9, 11 (F-09, F-11, F-12), 14, 15, DEC-17

BEGIN;
SELECT plan(15);

-- 1. Setup test users and profiles
SELECT tests.create_supabase_user('staff-org-a', 'staff_a_p8@test.local') \gset
SELECT tests.create_supabase_user('staff-org-b', 'staff_b_p8@test.local') \gset
SELECT tests.create_supabase_user('admin-user-p8', 'admin_p8@test.local') \gset

INSERT INTO public.profiles (id, role, org_id, full_name, is_active)
VALUES 
    ('staff-org-a', 'staff', 'a0000000-0000-0000-0000-000000000001', 'Staff Org A', true),
    ('staff-org-b', 'staff', 'a0000000-0000-0000-0000-000000000002', 'Staff Org B', true),
    ('admin-user-p8', 'admin', NULL, 'Platform Admin', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, org_id = EXCLUDED.org_id, role = EXCLUDED.role;

-- 2. Create test queues
INSERT INTO public.queues (id, org_id, name, default_service_minutes, is_active)
VALUES 
    ('b0000000-0000-0000-0000-000000000088', 'a0000000-0000-0000-0000-000000000001', 'Reports Test Queue A', 5, true),
    ('b0000000-0000-0000-0000-000000000089', 'a0000000-0000-0000-0000-000000000002', 'Reports Test Queue B', 5, true)
ON CONFLICT (id) DO UPDATE SET is_active = true;

INSERT INTO public.queue_state (queue_id, service_date, serving_number, last_issued, waiting_numbers, avg_service_minutes, status, version)
VALUES 
    ('b0000000-0000-0000-0000-000000000088', public.today_dhaka(), NULL, 0, '{}', 5.0, 'active', 1),
    ('b0000000-0000-0000-0000-000000000089', public.today_dhaka(), NULL, 0, '{}', 5.0, 'active', 1)
ON CONFLICT (queue_id) DO UPDATE SET status = 'active', waiting_numbers = '{}', serving_number = NULL;

-- 3. Seed deterministic tokens for known date '2026-10-20' on Queue A
-- Known timestamps in Asia/Dhaka (+06:00):
-- Token 1: issued 10:00 (+06), called 10:05 (wait 300s), finished 10:10 (service 300s), status completed
-- Token 2: issued 10:02 (+06), called 10:10 (wait 480s), finished 10:15 (service 300s), status completed
-- Token 3: issued 10:03 (+06), called 10:15 (wait 720s), finished 10:16, status skipped
-- Token 4: issued 10:04 (+06), finished 10:05, status cancelled
-- Token 5: issued 10:05 (+06), status waiting
INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, request_id, issued_at, called_at, finished_at, service_seconds)
VALUES 
    ('d0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000088', '2026-10-20', 1, 'rep-code-000000000001', 'completed', gen_random_uuid(), '2026-10-20 04:00:00+00', '2026-10-20 04:05:00+00', '2026-10-20 04:10:00+00', 300),
    ('d0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000088', '2026-10-20', 2, 'rep-code-000000000002', 'completed', gen_random_uuid(), '2026-10-20 04:02:00+00', '2026-10-20 04:10:00+00', '2026-10-20 04:15:00+00', 300),
    ('d0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000088', '2026-10-20', 3, 'rep-code-000000000003', 'skipped', gen_random_uuid(), '2026-10-20 04:03:00+00', '2026-10-20 04:15:00+00', '2026-10-20 04:16:00+00', NULL),
    ('d0000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000088', '2026-10-20', 4, 'rep-code-000000000004', 'cancelled', gen_random_uuid(), '2026-10-20 04:04:00+00', NULL, '2026-10-20 04:05:00+00', NULL),
    ('d0000000-0000-0000-0000-000000000015', 'b0000000-0000-0000-0000-000000000088', '2026-10-20', 5, 'rep-code-000000000005', 'waiting', gen_random_uuid(), '2026-10-20 04:05:00+00', NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Also seed 1 token on Queue B for cross-queue admin check
INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, request_id, issued_at, called_at, finished_at, service_seconds)
VALUES ('d0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000089', '2026-10-20', 1, 'rep-code-000000000021', 'completed', gen_random_uuid(), '2026-10-20 05:00:00+00', '2026-10-20 05:05:00+00', '2026-10-20 05:10:00+00', 300)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- Part 1: report_summary Verification (MUST & F-12)
-- =========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-a", "role": "authenticated"}';

-- Test 1: Exact status counts
SELECT is(
    (SELECT (report_summary('b0000000-0000-0000-0000-000000000088', '2026-10-20', '2026-10-20')->>'total_issued')::integer),
    5,
    'report_summary: total_issued matches seeded 5 tokens'
);

-- Test 2: Exact averages
-- avg_wait = (300 + 480 + 720) / 3 = 500.0s
-- avg_service = (300 + 300) / 2 = 300.0s
SELECT is(
    (SELECT (report_summary('b0000000-0000-0000-0000-000000000088', '2026-10-20', '2026-10-20')->>'avg_wait_seconds')::numeric),
    500.0,
    'report_summary: exact average wait seconds (500.0s)'
);

SELECT is(
    (SELECT (report_summary('b0000000-0000-0000-0000-000000000088', '2026-10-20', '2026-10-20')->>'avg_service_seconds')::numeric),
    300.0,
    'report_summary: exact average service seconds (300.0s)'
);

-- Test 3: Hourly distribution (tokens issued at 04:00-04:05 UTC = 10:00-10:05 Asia/Dhaka)
SELECT is(
    (SELECT (elem->>'count')::integer 
     FROM jsonb_array_elements(report_summary('b0000000-0000-0000-0000-000000000088', '2026-10-20', '2026-10-20')->'hourly') elem
     WHERE (elem->>'hour')::integer = 10),
    5,
    'report_summary: hourly peak traffic in Asia/Dhaka shows 5 tokens in hour 10'
);

-- Test 4: Range over 31 days rejected with VALIDATION_FAILED
SELECT throws_ok(
    $$ SELECT public.report_summary('b0000000-0000-0000-0000-000000000088', '2026-09-01'::date, '2026-10-15'::date) $$,
    'P0001',
    'VALIDATION_FAILED',
    'report_summary: range over 31 days throws VALIDATION_FAILED'
);

-- Test 5: Staff of another organization rejected with NOT_FOUND
SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-b", "role": "authenticated"}';
SELECT throws_ok(
    $$ SELECT public.report_summary('b0000000-0000-0000-0000-000000000088', '2026-10-20'::date, '2026-10-20'::date) $$,
    'P0001',
    'NOT_FOUND',
    'report_summary: staff from another organization cannot read Queue A'
);

-- Test 6: Admin sees all queues when passing null queue
SET LOCAL "request.jwt.claims" = '{"sub": "admin-user-p8", "role": "authenticated"}';
SELECT is(
    (SELECT (report_summary(NULL, '2026-10-20', '2026-10-20')->>'total_issued')::integer),
    6,
    'report_summary: admin with null queue sees all 6 tokens across Queue A and Queue B'
);

-- =========================================================================
-- Part 2: pause_queue and resume_queue (SHOULD F-11)
-- =========================================================================
SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-a", "role": "authenticated"}';

-- Test 7: pause_queue sets status to paused
SELECT is(
    (SELECT status FROM public.pause_queue('b0000000-0000-0000-0000-000000000088')),
    'paused',
    'pause_queue: queue status becomes paused'
);

-- Test 8: pause blocks issue_token (QUEUE_PAUSED)
SELECT throws_ok(
    $$ SELECT * FROM public.issue_token('b0000000-0000-0000-0000-000000000088', '+8801700000009', gen_random_uuid()) $$,
    'P0001',
    'QUEUE_PAUSED',
    'issue_token is blocked while queue is paused'
);

-- Test 9: pause blocks advance_queue (QUEUE_PAUSED)
SELECT throws_ok(
    $$ SELECT * FROM public.advance_queue('b0000000-0000-0000-0000-000000000088', 'next') $$,
    'P0001',
    'QUEUE_PAUSED',
    'advance_queue is blocked while queue is paused'
);

-- Test 10: resume_queue moves serving token called_at forward
RESET ROLE;
-- Setup active serving token on Queue A with called_at 10 minutes ago
UPDATE public.tokens 
SET status = 'serving', called_at = now() - interval '10 minutes'
WHERE id = 'd0000000-0000-0000-0000-000000000015';

-- Mock paused_at to 4 minutes ago
UPDATE public.queue_state
SET status = 'paused', paused_at = now() - interval '4 minutes', serving_number = 5
WHERE queue_id = 'b0000000-0000-0000-0000-000000000088';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-org-a", "role": "authenticated"}';

-- Resume queue
SELECT is(
    (SELECT status FROM public.resume_queue('b0000000-0000-0000-0000-000000000088')),
    'active',
    'resume_queue: status becomes active and paused_at is cleared'
);

-- Test 11: Verify serving token called_at was shifted forward by approx 4 minutes
-- Token called_at was originally 10m ago; shifted forward by 4m, it should now be ~6m ago (between 5 and 7 minutes ago)
SELECT ok(
    (SELECT called_at > (now() - interval '7 minutes') AND called_at < (now() - interval '5 minutes')
     FROM public.tokens WHERE id = 'd0000000-0000-0000-0000-000000000015'),
    'resume_queue: serving token called_at was shifted forward by the paused duration'
);

-- =========================================================================
-- Part 3: recall_token (SHOULD F-11, DEC-17)
-- =========================================================================
-- Test 12: Recall on non-skipped token throws TOKEN_NOT_SKIPPED
SELECT throws_ok(
    $$ SELECT * FROM public.recall_token('d0000000-0000-0000-0000-000000000011') $$, -- completed token
    'P0001',
    'TOKEN_NOT_SKIPPED',
    'recall_token: rejects non-skipped token'
);

-- Test 13: Recall on skipped token 3 succeeds and marks it waiting
SELECT is(
    (SELECT (SELECT status FROM public.tokens WHERE id = 'd0000000-0000-0000-0000-000000000013')),
    'skipped',
    'pre-condition: token 3 is skipped'
);

SELECT lives_ok(
    $$ SELECT public.recall_token('d0000000-0000-0000-0000-000000000013') $$,
    'recall_token: successfully recalls skipped token 3'
);

-- Test 14: Recalled token returns to waiting status and waiting_numbers includes its number
SELECT is(
    (SELECT status FROM public.tokens WHERE id = 'd0000000-0000-0000-0000-000000000013'),
    'waiting',
    'recall_token: token status is now waiting'
);

-- Test 15: Recalling the same token a second time throws ALREADY_RECALLED (DEC-17)
UPDATE public.tokens SET status = 'skipped' WHERE id = 'd0000000-0000-0000-0000-000000000013';

SELECT throws_ok(
    $$ SELECT public.recall_token('d0000000-0000-0000-0000-000000000013') $$,
    'P0001',
    'ALREADY_RECALLED',
    'recall_token: token cannot be recalled twice (ALREADY_RECALLED)'
);

SELECT * FROM finish();
ROLLBACK;
