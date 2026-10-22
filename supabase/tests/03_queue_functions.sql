-- pgTAP Test Suite 03: Queue Functions & Core Business Rules
-- Blueprint Sections 5, 9, 14, 15

BEGIN;
SELECT plan(32);

-- Setup test users
SELECT tests.create_supabase_user('staff-test-a', 'staff_test_a@test.local') \gset
SELECT tests.create_supabase_user('staff-test-b', 'staff_test_b@test.local') \gset

INSERT INTO public.profiles (id, role, org_id, full_name, is_active)
VALUES 
    ('staff-test-a', 'staff', 'a0000000-0000-0000-0000-000000000001', 'Staff Org A', true),
    ('staff-test-b', 'staff', 'a0000000-0000-0000-0000-000000000002', 'Staff Org B', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, org_id = EXCLUDED.org_id;

-- Create dedicated test queue
INSERT INTO public.queues (id, org_id, name, default_service_minutes, is_active)
VALUES ('b0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000001', 'Test Queue Functions', 5, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.queue_state (queue_id, service_date, serving_number, last_issued, waiting_numbers, avg_service_minutes, status, version)
VALUES ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), NULL, 0, '{}', 5.0, 'active', 1)
ON CONFLICT (queue_id) DO UPDATE SET 
    service_date = public.today_dhaka(),
    serving_number = NULL,
    last_issued = 0,
    waiting_numbers = '{}',
    avg_service_minutes = 5.0,
    status = 'active',
    version = 1;

-- =========================================================================
-- Test 1 & 2: Sequential numbering & waiting_numbers array
-- =========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-test-a", "role": "authenticated"}';

SELECT results_eq(
    $$ SELECT number, status FROM public.issue_token('b0000000-0000-0000-0000-000000000099', '+8801700000001', 'e0000000-0000-0000-0000-000000000001') $$,
    $$ VALUES (1, 'waiting'::text) $$,
    'First issued token gets number 1'
);

SELECT results_eq(
    $$ SELECT number, status FROM public.issue_token('b0000000-0000-0000-0000-000000000099', '+8801700000002', 'e0000000-0000-0000-0000-000000000002') $$,
    $$ VALUES (2, 'waiting'::text) $$,
    'Second issued token gets number 2'
);

SELECT is(
    (SELECT waiting_numbers FROM public.queue_state WHERE queue_id = 'b0000000-0000-0000-0000-000000000099'),
    ARRAY[1, 2]::integer[],
    'queue_state.waiting_numbers contains {1, 2}'
);

-- =========================================================================
-- Test 3: Idempotency / request_id replay
-- =========================================================================
SELECT results_eq(
    $$ SELECT number, status FROM public.issue_token('b0000000-0000-0000-0000-000000000099', '+8801700000002', 'e0000000-0000-0000-0000-000000000002') $$,
    $$ VALUES (2, 'waiting'::text) $$,
    'Replaying same request_id returns existing token number 2 without advancing last_issued'
);

SELECT is(
    (SELECT last_issued FROM public.queue_state WHERE queue_id = 'b0000000-0000-0000-0000-000000000099'),
    2,
    'last_issued is still 2 after request_id replay'
);

-- =========================================================================
-- Test 4: Day rollover
-- =========================================================================
-- Reset superuser to simulate yesterday's date
SET LOCAL ROLE postgres;
UPDATE public.queue_state
SET service_date = public.today_dhaka() - 1
WHERE queue_id = 'b0000000-0000-0000-0000-000000000099';

-- Switch back to staff and issue token
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-test-a", "role": "authenticated"}';

SELECT results_eq(
    $$ SELECT number, status FROM public.issue_token('b0000000-0000-0000-0000-000000000099', '+8801700000003', 'e0000000-0000-0000-0000-000000000003') $$,
    $$ VALUES (1, 'waiting'::text) $$,
    'Issuing across day rollover resets numbering to 1'
);

SELECT is(
    (SELECT count(*)::integer FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND status = 'expired'),
    2,
    'Yesterday waiting tokens are marked expired on rollover'
);

SELECT is(
    (SELECT service_date FROM public.queue_state WHERE queue_id = 'b0000000-0000-0000-0000-000000000099'),
    public.today_dhaka(),
    'queue_state.service_date is rolled to today in Asia/Dhaka'
);

-- =========================================================================
-- Test 5: Next with nothing serving calls lowest-numbered waiting token
-- =========================================================================
-- Token 1 is waiting from previous step. Advance with expected_serving_token_id = NULL
SELECT is(
    (SELECT serving_number FROM public.advance_queue('b0000000-0000-0000-0000-000000000099', 'next', NULL)),
    1,
    'Next with nothing serving sets token #1 as serving'
);

SELECT is(
    (SELECT status FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND number = 1 AND service_date = public.today_dhaka()),
    'serving',
    'Token #1 status updated to serving'
);

-- =========================================================================
-- Test 6: STALE_STATE changes nothing
-- =========================================================================
-- Attempt to advance with an incorrect expected serving token ID
SELECT throws_ok(
    $$ SELECT public.advance_queue('b0000000-0000-0000-0000-000000000099', 'next', '00000000-0000-0000-0000-000000000000'::uuid) $$,
    'P0001', -- raise_exception
    'STALE_STATE',
    'Mismatch in expected_serving_token_id raises STALE_STATE'
);

SELECT is(
    (SELECT serving_number FROM public.queue_state WHERE queue_id = 'b0000000-0000-0000-0000-000000000099'),
    1,
    'STALE_STATE error leaves serving_number unchanged'
);

-- =========================================================================
-- Test 7: NOTHING_SERVING on skip when queue is idle
-- =========================================================================
-- Finish token 1 so queue becomes idle
SELECT is(
    (SELECT serving_number FROM public.advance_queue(
        'b0000000-0000-0000-0000-000000000099', 
        'next', 
        (SELECT id FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND status = 'serving')
    )),
    NULL,
    'Next with no waiting tokens leaves queue idle (serving_number NULL)'
);

SELECT throws_ok(
    $$ SELECT public.advance_queue('b0000000-0000-0000-0000-000000000099', 'skip', NULL) $$,
    'P0001',
    'NOTHING_SERVING',
    'Skip with nobody serving raises NOTHING_SERVING'
);

-- =========================================================================
-- Test 8: Cancel only for waiting tokens
-- =========================================================================
-- Issue a token to cancel
SELECT results_eq(
    $$ SELECT number, status FROM public.issue_token('b0000000-0000-0000-0000-000000000099', '+8801700000004', gen_random_uuid()) $$,
    $$ VALUES (2, 'waiting'::text) $$,
    'Issued token #2 to test cancel'
);

SELECT is(
    (SELECT status FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND number = 2 AND service_date = public.today_dhaka()),
    'waiting',
    'Token #2 is waiting'
);

-- Cancel token #2
SELECT lives_ok(
    $$ SELECT public.cancel_token((SELECT id FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND number = 2 AND service_date = public.today_dhaka())) $$,
    'cancel_token succeeds on waiting token'
);

SELECT is(
    (SELECT status FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND number = 2 AND service_date = public.today_dhaka()),
    'cancelled',
    'Token #2 is cancelled'
);

-- Second cancel fails with TOKEN_NOT_WAITING
SELECT throws_ok(
    $$ SELECT public.cancel_token((SELECT id FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND number = 2 AND service_date = public.today_dhaka())) $$,
    'P0001',
    'TOKEN_NOT_WAITING',
    'Cancelling an already cancelled token raises TOKEN_NOT_WAITING'
);

-- =========================================================================
-- Test 9: Moving Average calculation rules (FR-11, D-04)
-- =========================================================================
SET LOCAL ROLE postgres;
-- Clean up old completed tokens on this queue to test average from scratch
DELETE FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099';
UPDATE public.queue_state 
SET last_issued = 0, waiting_numbers = '{}', serving_number = NULL, avg_service_minutes = 5.0 
WHERE queue_id = 'b0000000-0000-0000-0000-000000000099';

-- Insert 3 valid completed tokens: 300s (5m), 600s (10m), 900s (15m) -> Mean: 600s = 10.0m
-- Insert 1 outlier > 3600s (4000s) -> Excluded!
-- Insert 1 fast click < 20s (10s) -> Excluded!
-- Insert 1 skipped token -> Excluded!
INSERT INTO public.tokens (queue_id, service_date, number, public_code, status, service_seconds, request_id, called_at, finished_at)
VALUES 
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 1, 'code000000000000000001', 'completed', 300, gen_random_uuid(), now() - interval '300s', now() - interval '200s'),
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 2, 'code000000000000000002', 'completed', 600, gen_random_uuid(), now() - interval '600s', now() - interval '150s'),
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 3, 'code000000000000000003', 'completed', 900, gen_random_uuid(), now() - interval '900s', now() - interval '100s'),
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 4, 'code000000000000000004', 'completed', 4000, gen_random_uuid(), now() - interval '4000s', now() - interval '50s'),
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 5, 'code000000000000000005', 'completed', 10, gen_random_uuid(), now() - interval '10s', now() - interval '20s'),
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 6, 'code000000000000000006', 'skipped', NULL, gen_random_uuid(), now() - interval '50s', now() - interval '10s'),
    ('b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 7, 'code000000000000000007', 'waiting', NULL, gen_random_uuid(), NULL, NULL);

UPDATE public.queue_state SET last_issued = 7, waiting_numbers = '{7}' WHERE queue_id = 'b0000000-0000-0000-0000-000000000099';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-test-a", "role": "authenticated"}';

-- Advance queue to trigger average recompute
SELECT is(
    (SELECT avg_service_minutes FROM public.advance_queue('b0000000-0000-0000-0000-000000000099', 'next', NULL)),
    10.0,
    'Average correctly excludes outliers (>3600s, <20s) and skipped, computing 10.0 min from {300, 600, 900}'
);

-- =========================================================================
-- Test 10: Near-turn notification rows
-- =========================================================================
SET LOCAL ROLE postgres;
DELETE FROM public.notification_outbox;
DELETE FROM public.tokens WHERE queue_id = 'b0000000-0000-0000-0000-000000000099';
UPDATE public.queue_state 
SET serving_number = 12, last_issued = 16, waiting_numbers = '{13,14,15,16}' 
WHERE queue_id = 'b0000000-0000-0000-0000-000000000099';

-- Insert serving 12 and waiting 13-16 with phone numbers
INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, phone, request_id, called_at)
VALUES ('d0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 12, 'code000000000000000012', 'serving', '+8801700000012', gen_random_uuid(), now());

INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, phone, request_id)
VALUES 
    ('d0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 13, 'code000000000000000013', 'waiting', '+8801700000013', gen_random_uuid()),
    ('d0000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 14, 'code000000000000000014', 'waiting', '+8801700000014', gen_random_uuid()),
    ('d0000000-0000-0000-0000-000000000015', 'b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 15, 'code000000000000000015', 'waiting', '+8801700000015', gen_random_uuid()),
    ('d0000000-0000-0000-0000-000000000016', 'b0000000-0000-0000-0000-000000000099', public.today_dhaka(), 16, 'code000000000000000016', 'waiting', '+8801700000016', gen_random_uuid());

-- Run enqueue_near_turn
SELECT lives_ok(
    $$ SELECT public.enqueue_near_turn('b0000000-0000-0000-0000-000000000099') $$,
    'enqueue_near_turn executes successfully'
);

-- Token 15 is 3 ahead (12 serving + 13, 14 waiting = 3 ahead). It must have an outbox row.
SELECT is(
    (SELECT count(*)::integer FROM public.notification_outbox WHERE token_id = 'd0000000-0000-0000-0000-000000000015'),
    1,
    'Outbox row exists for token #15 (3 people ahead)'
);

-- Token 16 is 4 ahead. It must NOT have an outbox row.
SELECT is(
    (SELECT count(*)::integer FROM public.notification_outbox WHERE token_id = 'd0000000-0000-0000-0000-000000000016'),
    0,
    'Outbox row does NOT exist for token #16 (4 people ahead)'
);

-- Run enqueue_near_turn again: no duplicate row
SELECT public.enqueue_near_turn('b0000000-0000-0000-0000-000000000099');
SELECT is(
    (SELECT count(*)::integer FROM public.notification_outbox WHERE token_id = 'd0000000-0000-0000-0000-000000000015'),
    1,
    'Second run does not duplicate outbox row for token #15'
);

-- =========================================================================
-- Test 11: Audit events logged with actor
-- =========================================================================
SELECT is(
    (SELECT count(*)::integer FROM public.audit_events WHERE queue_id = 'b0000000-0000-0000-0000-000000000099' AND actor_id = 'staff-test-a'),
    (SELECT count(*)::integer FROM public.audit_events WHERE queue_id = 'b0000000-0000-0000-0000-000000000099'),
    'All audit events for queue are logged with staff-test-a actor'
);

-- =========================================================================
-- Test 12: get_token_view behavior & privacy (SEC-03, SEC-04)
-- =========================================================================
SET LOCAL ROLE anon;

-- Valid token view
SELECT is(
    (SELECT token_number FROM public.get_token_view('code000000000000000015')),
    15,
    'get_token_view returns token number 15 for valid public code'
);

-- Unknown token view returns 0 rows
SELECT is(
    (SELECT count(*)::integer FROM public.get_token_view('nonexistent_code_12345')),
    0,
    'get_token_view returns 0 rows for unknown code'
);

-- Expired token view reports expired status
SET LOCAL ROLE postgres;
UPDATE public.tokens SET service_date = public.today_dhaka() - 2 WHERE id = 'd0000000-0000-0000-0000-000000000015';

SET LOCAL ROLE anon;
SELECT is(
    (SELECT status FROM public.get_token_view('code000000000000000015')),
    'expired',
    'get_token_view reports expired for tokens with past service_date'
);

-- =========================================================================
-- Test 13: Function privileges for anon (has_function_privilege)
-- =========================================================================
SELECT ok(
    has_function_privilege('anon', 'public.get_token_view(text)', 'EXECUTE'),
    'anon CAN execute get_token_view'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.issue_token(uuid, text, uuid)', 'EXECUTE'),
    'anon CANNOT execute issue_token'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.advance_queue(uuid, text, uuid)', 'EXECUTE'),
    'anon CANNOT execute advance_queue'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.cancel_token(uuid)', 'EXECUTE'),
    'anon CANNOT execute cancel_token'
);

-- =========================================================================
-- Test 14: Cross-organization access rejected
-- =========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "staff-test-b", "role": "authenticated"}';

SELECT throws_ok(
    $$ SELECT * FROM public.issue_token('b0000000-0000-0000-0000-000000000099', '+8801700000099', gen_random_uuid()) $$,
    'P0001',
    'NOT_FOUND',
    'Staff of Org B receives NOT_FOUND when attempting to issue on Org A queue'
);

SELECT * FROM finish();
ROLLBACK;
