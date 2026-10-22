-- Migration 17: register_push and purge_expired_pii functions
-- Blueprint Section 10 (SEC-07, 11), Section 14 (Retention), Section 15 & Phase 7

-- =========================================================================
-- 1. register_push(p_code, p_endpoint, p_p256dh, p_auth)
-- Registers a Web Push subscription for a token using its public_code.
-- Token must be in status 'waiting' or 'serving' for today's queue day.
-- Upserts by endpoint and calls enqueue_near_turn.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.register_push(
    p_code text,
    p_endpoint text,
    p_p256dh text,
    p_auth text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token RECORD;
    v_sub_id uuid;
BEGIN
    -- 1. Fetch token
    SELECT id, queue_id, service_date, status INTO v_token
    FROM public.tokens
    WHERE public_code = p_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 2. Verify token is active (waiting or serving on today's queue day)
    IF v_token.service_date < public.today_dhaka() OR v_token.status NOT IN ('waiting', 'serving') THEN
        RAISE EXCEPTION 'TOKEN_NOT_WAITING';
    END IF;

    -- 3. Upsert push subscription by endpoint
    INSERT INTO public.push_subscriptions (
        token_id,
        endpoint,
        p256dh,
        auth,
        created_at
    )
    VALUES (
        v_token.id,
        p_endpoint,
        p_p256dh,
        p_auth,
        now()
    )
    ON CONFLICT (endpoint) DO UPDATE
    SET token_id = EXCLUDED.token_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        created_at = now()
    RETURNING id INTO v_sub_id;

    -- 4. Immediately check near-turn condition and enqueue if eligible
    PERFORM public.enqueue_near_turn(v_token.queue_id);

    RETURN v_sub_id;
END;
$$;

-- =========================================================================
-- 2. purge_expired_pii()
-- Clears phone numbers and deletes push_subscriptions & notification_outbox
-- for tokens whose service_date is older than 7 days (SEC-11).
-- Token rows themselves are kept for historical analytics and reports.
-- Deletes audit_events older than 180 days.
-- Returns counts of purged records.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.purge_expired_pii()
RETURNS TABLE (
    purged_phones integer,
    purged_subscriptions integer,
    purged_outbox integer,
    purged_audit_events integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purged_phones integer := 0;
    v_purged_subscriptions integer := 0;
    v_purged_outbox integer := 0;
    v_purged_audit integer := 0;
    v_cutoff_date date;
BEGIN
    v_cutoff_date := public.today_dhaka() - 7;

    -- 1. Clear phone numbers on tokens older than 7 days
    WITH updated_tokens AS (
        UPDATE public.tokens
        SET phone = NULL
        WHERE service_date < v_cutoff_date
          AND phone IS NOT NULL
        RETURNING id
    )
    SELECT count(*)::integer INTO v_purged_phones FROM updated_tokens;

    -- 2. Delete push_subscriptions for tokens older than 7 days
    WITH deleted_subs AS (
        DELETE FROM public.push_subscriptions
        WHERE token_id IN (
            SELECT id FROM public.tokens WHERE service_date < v_cutoff_date
        )
        RETURNING id
    )
    SELECT count(*)::integer INTO v_purged_subscriptions FROM deleted_subs;

    -- 3. Delete notification_outbox for tokens older than 7 days
    WITH deleted_outbox AS (
        DELETE FROM public.notification_outbox
        WHERE token_id IN (
            SELECT id FROM public.tokens WHERE service_date < v_cutoff_date
        )
        RETURNING id
    )
    SELECT count(*)::integer INTO v_purged_outbox FROM deleted_outbox;

    -- 4. Delete audit_events older than 180 days
    WITH deleted_audit AS (
        DELETE FROM public.audit_events
        WHERE created_at < (now() - INTERVAL '180 days')
        RETURNING id
    )
    SELECT count(*)::integer INTO v_purged_audit FROM deleted_audit;

    RETURN QUERY SELECT v_purged_phones, v_purged_subscriptions, v_purged_outbox, v_purged_audit;
END;
$$;

-- =========================================================================
-- Permissions & Security
-- Strictly revoke from PUBLIC, anon, and authenticated. Service-role only!
-- =========================================================================
REVOKE ALL ON FUNCTION public.register_push(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_pii() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_push(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_pii() TO service_role;
