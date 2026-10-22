-- pgTAP Test Suite 05: Notifications and PII Purge
-- Blueprint Section 10 (SEC-07, 11), Section 14 (Retention), Section 15 & Phase 7

BEGIN;
SELECT plan(10);

-- Create test queue & tokens for service_role
CREATE EXTENSION IF NOT EXISTS pgtap;

-- 1. Security Check: anon cannot execute register_push
SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.register_push('dummy', 'https://endpoint', 'p256dh', 'auth') $$,
    '42501',
    NULL,
    'anon cannot execute register_push'
);

-- 2. Security Check: authenticated cannot execute register_push
SET LOCAL ROLE authenticated;
SELECT throws_ok(
    $$ SELECT public.register_push('dummy', 'https://endpoint', 'p256dh', 'auth') $$,
    '42501',
    NULL,
    'authenticated cannot execute register_push'
);

-- 3. Security Check: anon & authenticated cannot execute purge_expired_pii
SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT * FROM public.purge_expired_pii() $$,
    '42501',
    NULL,
    'anon cannot execute purge_expired_pii'
);

-- Reset to postgres / service_role
RESET ROLE;

-- Setup test data
DO $$
DECLARE
    v_queue_id uuid := 'b0000000-0000-0000-0000-000000000001';
    v_old_token_id uuid;
    v_fresh_token_id uuid;
BEGIN
    -- Token 1: Waiting token today
    INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, phone, request_id)
    VALUES (
        'd0000000-0000-0000-0000-000000000001',
        v_queue_id,
        public.today_dhaka(),
        101,
        'valid-waiting-code',
        'waiting',
        '+8801700000001',
        gen_random_uuid()
    ) ON CONFLICT (id) DO NOTHING;

    -- Token 2: Old token older than 7 days (8 days old)
    INSERT INTO public.tokens (id, queue_id, service_date, number, public_code, status, phone, request_id)
    VALUES (
        'd0000000-0000-0000-0000-000000000002',
        v_queue_id,
        public.today_dhaka() - 8,
        102,
        'old-token-code',
        'completed',
        '+8801700000002',
        gen_random_uuid()
    ) ON CONFLICT (id) DO NOTHING;

    -- Push subscription for old token
    INSERT INTO public.push_subscriptions (token_id, endpoint, p256dh, auth)
    VALUES (
        'd0000000-0000-0000-0000-000000000002',
        'https://push.example.com/old-sub',
        'p256dh-old',
        'auth-old'
    ) ON CONFLICT (endpoint) DO NOTHING;

    -- Outbox for old token
    INSERT INTO public.notification_outbox (token_id, channel, kind, status)
    VALUES (
        'd0000000-0000-0000-0000-000000000002',
        'sms',
        'near_turn',
        'sent'
    ) ON CONFLICT (token_id, channel, kind) DO NOTHING;
END;
$$;

-- 4. register_push succeeds for waiting token
SELECT lives_ok(
    $$ SELECT public.register_push('valid-waiting-code', 'https://push.example.com/fresh-sub', 'p256dh-fresh', 'auth-fresh') $$,
    'service_role can register push for waiting token'
);

-- 5. register_push rejects non-waiting token (e.g. completed or cancelled)
UPDATE public.tokens SET status = 'completed' WHERE id = 'd0000000-0000-0000-0000-000000000001';

SELECT throws_ok(
    $$ SELECT public.register_push('valid-waiting-code', 'https://push.example.com/fresh-sub', 'p256dh-fresh', 'auth-fresh') $$,
    'P0001',
    'TOKEN_NOT_WAITING',
    'register_push rejects token that is no longer waiting or serving'
);

-- 6. purge_expired_pii execution clears phone, sub, and outbox on tokens > 7 days old
SELECT lives_ok(
    $$ SELECT * FROM public.purge_expired_pii() $$,
    'service_role can run purge_expired_pii'
);

-- 7. Verify retention outcome: old phone cleared, old subscriptions & outbox deleted, token row preserved
SELECT is(
    (SELECT phone FROM public.tokens WHERE id = 'd0000000-0000-0000-0000-000000000002'),
    NULL,
    'old token phone is cleared (SEC-11)'
);

-- 8. Verify old push subscriptions deleted
SELECT is(
    (SELECT count(*)::integer FROM public.push_subscriptions WHERE token_id = 'd0000000-0000-0000-0000-000000000002'),
    0,
    'old push subscriptions are deleted'
);

-- 9. Verify old notification outbox rows deleted
SELECT is(
    (SELECT count(*)::integer FROM public.notification_outbox WHERE token_id = 'd0000000-0000-0000-0000-000000000002'),
    0,
    'old notification outbox rows are deleted'
);

-- 10. Verify old token row is preserved
SELECT is(
    (SELECT count(*)::integer FROM public.tokens WHERE id = 'd0000000-0000-0000-0000-000000000002'),
    1,
    'old token row is preserved after purge (keeps historical reporting data intact)'
);

SELECT * FROM finish();
ROLLBACK;
