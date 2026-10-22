-- Migration 08: Core Queue Business Functions in SQL
-- Blueprint Sections 5 (FR-06, 08, 09, 11, 12, 13), 9, 14, 15

-- =========================================================================
-- Helper: today_dhaka()
-- Returns the current date in Asia/Dhaka timezone (UTC+6)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.today_dhaka()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT (timezone('Asia/Dhaka', now()))::date;
$$;

-- =========================================================================
-- 1. roll_queue_day(queue_id)
-- Internal: If queue_state.service_date is not today (Asia/Dhaka),
-- marks leftover waiting/serving tokens as expired, resets state to idle,
-- sets avg_service_minutes to queue default, and bumps version.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.roll_queue_day(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date;
    v_state_date date;
    v_default_minutes smallint;
BEGIN
    v_today := public.today_dhaka();

    -- Read current state date
    SELECT service_date INTO v_state_date
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- Only roll if the date has changed
    IF v_state_date = v_today THEN
        RETURN;
    END IF;

    -- Fetch queue's configured default service minutes
    SELECT default_service_minutes INTO v_default_minutes
    FROM public.queues
    WHERE id = p_queue_id;

    -- Mark leftover waiting and serving tokens of the old date as expired
    UPDATE public.tokens
    SET status = 'expired',
        finished_at = COALESCE(finished_at, now())
    WHERE queue_id = p_queue_id
      AND service_date < v_today
      AND status IN ('waiting', 'serving');

    -- Reset queue_state for the new day
    UPDATE public.queue_state
    SET service_date = v_today,
        serving_number = NULL,
        last_issued = 0,
        waiting_numbers = '{}'::integer[],
        avg_service_minutes = v_default_minutes::numeric(5,1),
        status = 'active',
        paused_at = NULL,
        version = version + 1,
        updated_at = now()
    WHERE queue_id = p_queue_id;
END;
$$;

-- =========================================================================
-- 2. enqueue_near_turn(queue_id)
-- Internal: Enqueues pending near-turn outbox rows for waiting tokens
-- with 3 or fewer people ahead (serving token counts if number is lower).
-- Channel 'sms' if token has phone; 'push' if push_subscription exists.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.enqueue_near_turn(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_serving_number integer;
    v_service_date date;
BEGIN
    SELECT serving_number, service_date
    INTO v_serving_number, v_service_date
    FROM public.queue_state
    WHERE queue_id = p_queue_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 1. Enqueue SMS for waiting tokens with 3 or fewer ahead and phone present
    INSERT INTO public.notification_outbox (token_id, channel, kind, status)
    SELECT t.id, 'sms', 'near_turn', 'pending'
    FROM public.tokens t
    WHERE t.queue_id = p_queue_id
      AND t.service_date = v_service_date
      AND t.status = 'waiting'
      AND t.phone IS NOT NULL
      AND (
          (CASE WHEN v_serving_number IS NOT NULL AND v_serving_number < t.number THEN 1 ELSE 0 END)
          + (SELECT count(*)::integer 
             FROM public.tokens w 
             WHERE w.queue_id = p_queue_id 
               AND w.service_date = v_service_date 
               AND w.status = 'waiting' 
               AND w.number < t.number)
      ) <= 3
    ON CONFLICT (token_id, channel, kind) DO NOTHING;

    -- 2. Enqueue Web Push for waiting tokens with 3 or fewer ahead and subscription present
    INSERT INTO public.notification_outbox (token_id, channel, kind, status)
    SELECT DISTINCT t.id, 'push', 'near_turn', 'pending'
    FROM public.tokens t
    JOIN public.push_subscriptions ps ON ps.token_id = t.id
    WHERE t.queue_id = p_queue_id
      AND t.service_date = v_service_date
      AND t.status = 'waiting'
      AND (
          (CASE WHEN v_serving_number IS NOT NULL AND v_serving_number < t.number THEN 1 ELSE 0 END)
          + (SELECT count(*)::integer 
             FROM public.tokens w 
             WHERE w.queue_id = p_queue_id 
               AND w.service_date = v_service_date 
               AND w.status = 'waiting' 
               AND w.number < t.number)
      ) <= 3
    ON CONFLICT (token_id, channel, kind) DO NOTHING;
END;
$$;

-- =========================================================================
-- 3. issue_token(queue_id, phone, request_id)
-- Caller-facing: Atomic token issuing with request_id idempotency.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.issue_token(
    p_queue_id uuid,
    p_phone text DEFAULT NULL,
    p_request_id uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE (
    number integer,
    public_code text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_queue_active boolean;
    v_state RECORD;
    v_next_number integer;
    v_public_code text;
    v_token_id uuid;
    v_existing_token RECORD;
BEGIN
    -- 1. Check caller profile & active organization
    SELECT p.org_id INTO v_caller_org_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.is_active = true
      AND o.is_active = true;

    IF v_caller_org_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    -- 2. Check queue existence and ownership
    SELECT q.org_id, q.is_active INTO v_queue_org_id, v_queue_active
    FROM public.queues q
    WHERE q.id = p_queue_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    IF v_queue_org_id != v_caller_org_id THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 3. Lock queue_state row FOR UPDATE
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 4. Roll day if needed
    PERFORM public.roll_queue_day(p_queue_id);

    -- Reload state after potential roll
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    -- 5. Refuse inactive or paused queue
    IF NOT v_queue_active THEN
        RAISE EXCEPTION 'QUEUE_INACTIVE';
    END IF;

    IF v_state.status = 'paused' THEN
        RAISE EXCEPTION 'QUEUE_PAUSED';
    END IF;

    -- 6. Idempotency check: if (queue_id, request_id) already exists return that token
    SELECT t.number, t.public_code, t.status INTO v_existing_token
    FROM public.tokens t
    WHERE t.queue_id = p_queue_id AND t.request_id = p_request_id;

    IF FOUND THEN
        RETURN QUERY SELECT v_existing_token.number, v_existing_token.public_code, v_existing_token.status;
        RETURN;
    END IF;

    -- 7. Calculate next sequential number
    v_next_number := v_state.last_issued + 1;

    -- 8. Generate 22 characters of base64url from 16 random bytes (128 bits)
    v_public_code := substring(
        replace(replace(encode(extensions.gen_random_bytes(16), 'base64'), '+', '-'), '/', '_')
        FROM 1 FOR 22
    );

    -- 9. Insert token
    INSERT INTO public.tokens (
        queue_id,
        service_date,
        number,
        public_code,
        status,
        phone,
        request_id,
        issued_at
    )
    VALUES (
        p_queue_id,
        v_state.service_date,
        v_next_number,
        v_public_code,
        'waiting',
        p_phone,
        p_request_id,
        now()
    )
    RETURNING id INTO v_token_id;

    -- 10. Update queue_state (append to waiting_numbers, bump last_issued and version)
    UPDATE public.queue_state
    SET last_issued = v_next_number,
        waiting_numbers = array_append(waiting_numbers, v_next_number),
        version = version + 1,
        updated_at = now()
    WHERE queue_id = p_queue_id;

    -- 11. Audit event
    INSERT INTO public.audit_events (queue_id, token_id, actor_id, action)
    VALUES (p_queue_id, v_token_id, auth.uid(), 'issue');

    -- 12. Enqueue near-turn alerts
    PERFORM public.enqueue_near_turn(p_queue_id);

    -- 13. Return token view
    RETURN QUERY SELECT v_next_number, v_public_code, 'waiting'::text;
END;
$$;

-- =========================================================================
-- 4. advance_queue(queue_id, action, expected_serving_token_id)
-- Caller-facing: Advances or skips queue tokens, updates moving average,
-- writes audit events, and calls enqueue_near_turn.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.advance_queue(
    p_queue_id uuid,
    p_action text,
    p_expected_serving_token_id uuid DEFAULT NULL
)
RETURNS public.queue_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_queue_active boolean;
    v_default_minutes smallint;
    v_state RECORD;
    v_current_serving RECORD;
    v_actual_serving_id uuid := NULL;
    v_next_token RECORD;
    v_new_serving_number integer := NULL;
    v_new_waiting_numbers integer[] := '{}'::integer[];
    v_service_seconds integer;
    v_new_avg_minutes numeric(5,1);
    v_audit_token_id uuid := NULL;
    v_result_state public.queue_state;
BEGIN
    -- Validate action input
    IF p_action NOT IN ('next', 'skip') THEN
        RAISE EXCEPTION 'VALIDATION_FAILED';
    END IF;

    -- 1. Check caller profile & active organization
    SELECT p.org_id INTO v_caller_org_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.is_active = true
      AND o.is_active = true;

    IF v_caller_org_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    -- 2. Check queue existence and ownership
    SELECT q.org_id, q.is_active, q.default_service_minutes 
    INTO v_queue_org_id, v_queue_active, v_default_minutes
    FROM public.queues q
    WHERE q.id = p_queue_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    IF v_queue_org_id != v_caller_org_id THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 3. Lock queue_state row FOR UPDATE
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 4. Roll day if needed
    PERFORM public.roll_queue_day(p_queue_id);

    -- Reload state after potential roll
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    -- 5. Check queue active and paused
    IF NOT v_queue_active THEN
        RAISE EXCEPTION 'QUEUE_INACTIVE';
    END IF;

    IF v_state.status = 'paused' THEN
        RAISE EXCEPTION 'QUEUE_PAUSED';
    END IF;

    -- 6. Identify currently serving token
    SELECT * INTO v_current_serving
    FROM public.tokens
    WHERE queue_id = p_queue_id
      AND service_date = v_state.service_date
      AND status = 'serving'
    LIMIT 1;

    IF FOUND THEN
        v_actual_serving_id := v_current_serving.id;
    END IF;

    -- 7. Concurrency / double-click protection: compare expected vs actual serving token
    IF p_expected_serving_token_id IS DISTINCT FROM v_actual_serving_id THEN
        RAISE EXCEPTION 'STALE_STATE';
    END IF;

    -- 8. Skip with nobody serving is rejected
    IF p_action = 'skip' AND v_actual_serving_id IS NULL THEN
        RAISE EXCEPTION 'NOTHING_SERVING';
    END IF;

    -- 9. Finish the current serving token (if present)
    IF v_actual_serving_id IS NOT NULL THEN
        v_audit_token_id := v_actual_serving_id;

        IF p_action = 'next' THEN
            v_service_seconds := GREATEST(1, EXTRACT(EPOCH FROM (now() - v_current_serving.called_at))::integer);
            UPDATE public.tokens
            SET status = 'completed',
                finished_at = now(),
                service_seconds = v_service_seconds
            WHERE id = v_actual_serving_id;
        ELSIF p_action = 'skip' THEN
            UPDATE public.tokens
            SET status = 'skipped',
                finished_at = now(),
                service_seconds = NULL
            WHERE id = v_actual_serving_id;
        END IF;
    END IF;

    -- 10. Call the lowest-numbered waiting token
    SELECT * INTO v_next_token
    FROM public.tokens
    WHERE queue_id = p_queue_id
      AND service_date = v_state.service_date
      AND status = 'waiting'
    ORDER BY number ASC
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.tokens
        SET status = 'serving',
            called_at = now()
        WHERE id = v_next_token.id;

        v_new_serving_number := v_next_token.number;
        v_new_waiting_numbers := array_remove(v_state.waiting_numbers, v_next_token.number);
        v_audit_token_id := COALESCE(v_next_token.id, v_audit_token_id);
    ELSE
        -- No tokens waiting; queue becomes idle
        v_new_serving_number := NULL;
        v_new_waiting_numbers := '{}'::integer[];
    END IF;

    -- 11. Recompute moving average (FR-11, D-04):
    -- Mean service_seconds of last 5 completed tokens between 20s and 3600s.
    -- Fewer than 5 uses those available; none uses queue default_service_minutes.
    WITH recent_5 AS (
        SELECT service_seconds
        FROM public.tokens
        WHERE queue_id = p_queue_id
          AND status = 'completed'
          AND service_seconds >= 20
          AND service_seconds <= 3600
        ORDER BY finished_at DESC
        LIMIT 5
    )
    SELECT COALESCE(
        ROUND((AVG(service_seconds) / 60.0)::numeric, 1),
        v_default_minutes::numeric(5,1)
    ) INTO v_new_avg_minutes
    FROM recent_5;

    -- 12. Update queue_state
    UPDATE public.queue_state
    SET serving_number = v_new_serving_number,
        waiting_numbers = v_new_waiting_numbers,
        avg_service_minutes = v_new_avg_minutes,
        version = version + 1,
        updated_at = now()
    WHERE queue_id = p_queue_id
    RETURNING * INTO v_result_state;

    -- 13. Audit event
    INSERT INTO public.audit_events (queue_id, token_id, actor_id, action)
    VALUES (p_queue_id, v_audit_token_id, auth.uid(), p_action);

    -- 14. Enqueue near-turn alerts
    PERFORM public.enqueue_near_turn(p_queue_id);

    RETURN v_result_state;
END;
$$;

-- =========================================================================
-- 5. cancel_token(token_id)
-- Caller-facing: Cancels a waiting token, updates queue_state, and audits.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_token(p_token_id uuid)
RETURNS public.queue_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token RECORD;
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_result_state public.queue_state;
BEGIN
    -- 1. Check token existence
    SELECT * INTO v_token
    FROM public.tokens
    WHERE id = p_token_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 2. Check caller profile & queue org ownership
    SELECT q.org_id INTO v_queue_org_id
    FROM public.queues q
    WHERE q.id = v_token.queue_id;

    SELECT p.org_id INTO v_caller_org_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.is_active = true
      AND o.is_active = true;

    IF v_caller_org_id IS NULL OR v_queue_org_id != v_caller_org_id THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 3. Only waiting tokens can be cancelled
    IF v_token.status != 'waiting' THEN
        RAISE EXCEPTION 'TOKEN_NOT_WAITING';
    END IF;

    -- 4. Mark token cancelled
    UPDATE public.tokens
    SET status = 'cancelled',
        finished_at = now()
    WHERE id = p_token_id;

    -- 5. Lock and update queue_state
    UPDATE public.queue_state
    SET waiting_numbers = array_remove(waiting_numbers, v_token.number),
        version = version + 1,
        updated_at = now()
    WHERE queue_id = v_token.queue_id
    RETURNING * INTO v_result_state;

    -- 6. Audit event
    INSERT INTO public.audit_events (queue_id, token_id, actor_id, action)
    VALUES (v_token.queue_id, p_token_id, auth.uid(), 'cancel');

    -- 7. Enqueue near-turn alerts
    PERFORM public.enqueue_near_turn(v_token.queue_id);

    RETURN v_result_state;
END;
$$;

-- =========================================================================
-- 6. get_token_view(code)
-- Public / Caller-facing: Read-only token view for visitors & staff.
-- Returns NO phone numbers, token IDs or organization info.
-- Returns 'expired' if service_date < today in Asia/Dhaka.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_token_view(p_code text)
RETURNS TABLE (
    token_number integer,
    status text,
    queue_id uuid,
    queue_name text,
    service_date date,
    serving_number integer,
    waiting_numbers integer[],
    avg_service_minutes numeric(5,1),
    queue_status text,
    version bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        t.number AS token_number,
        CASE 
            WHEN t.service_date < public.today_dhaka() THEN 'expired'
            ELSE t.status
        END AS status,
        q.id AS queue_id,
        q.name AS queue_name,
        t.service_date,
        qs.serving_number,
        qs.waiting_numbers,
        qs.avg_service_minutes,
        qs.status AS queue_status,
        qs.version
    FROM public.tokens t
    JOIN public.queues q ON q.id = t.queue_id
    JOIN public.queue_state qs ON qs.queue_id = t.queue_id
    WHERE t.public_code = p_code
    LIMIT 1;
$$;

-- =========================================================================
-- Security & Permissions (Section 15, DEC-08)
-- Revoke all function execute from PUBLIC and anon, except get_token_view
-- =========================================================================
REVOKE ALL ON FUNCTION public.today_dhaka() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roll_queue_day(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_near_turn(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_token(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_queue(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_token_view(text) FROM PUBLIC;

-- anon privileges: only get_token_view is accessible to anon
GRANT EXECUTE ON FUNCTION public.get_token_view(text) TO anon, authenticated, service_role;

-- authenticated privileges: caller-facing functions
GRANT EXECUTE ON FUNCTION public.issue_token(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_queue(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_token(uuid) TO authenticated, service_role;

-- internal helpers
GRANT EXECUTE ON FUNCTION public.today_dhaka() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.roll_queue_day(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_near_turn(uuid) TO service_role;
