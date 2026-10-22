-- Migration 18: report_summary, pause_queue, resume_queue, and recall_token
-- Blueprint Sections 5 (FR-15, 18, 19), 9, 11 (F-09, F-11, F-12), 14, 15, DEC-17

-- =========================================================================
-- 1. report_summary(p_queue_id, p_from, p_to)
-- Returns aggregated queue metrics for a date range (max 31 days).
-- Accessible to staff of the queue's organization and admin (p_queue_id may be null for admin).
-- Returns status counts, average wait seconds, average service seconds,
-- daily summary array, and hourly distribution in Asia/Dhaka timezone.
-- Returns NO phone numbers (SEC-03, SEC-11).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.report_summary(
    p_queue_id uuid DEFAULT NULL,
    p_from date DEFAULT NULL,
    p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role text;
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_queue_name text := NULL;
    v_org_active boolean;
    v_from date;
    v_to date;
    v_total_issued integer := 0;
    v_total_waiting integer := 0;
    v_total_serving integer := 0;
    v_total_completed integer := 0;
    v_total_skipped integer := 0;
    v_total_cancelled integer := 0;
    v_total_expired integer := 0;
    v_avg_wait numeric(10,1) := NULL;
    v_avg_service numeric(10,1) := NULL;
    v_daily jsonb := '[]'::jsonb;
    v_hourly jsonb := '[]'::jsonb;
BEGIN
    -- 1. Check authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED';
    END IF;

    -- 2. Fetch caller profile
    SELECT role, org_id, is_active INTO v_caller_role, v_caller_org_id, v_org_active
    FROM public.profiles
    WHERE id = auth.uid();

    IF NOT FOUND OR NOT v_org_active THEN
        RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    -- 3. Authorization rules
    IF v_caller_role = 'staff' THEN
        -- Check staff's organization is active
        SELECT is_active INTO v_org_active
        FROM public.organizations
        WHERE id = v_caller_org_id;

        IF NOT FOUND OR NOT v_org_active THEN
            RAISE EXCEPTION 'FORBIDDEN';
        END IF;

        -- Staff must specify a queue
        IF p_queue_id IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_FAILED';
        END IF;

        -- Queue must exist and belong to staff's organization
        SELECT org_id, name INTO v_queue_org_id, v_queue_name
        FROM public.queues
        WHERE id = p_queue_id;

        IF NOT FOUND OR v_queue_org_id != v_caller_org_id THEN
            RAISE EXCEPTION 'NOT_FOUND';
        END IF;

    ELSIF v_caller_role = 'admin' THEN
        -- Admin can pass a specific queue or null for all queues
        IF p_queue_id IS NOT NULL THEN
            SELECT name INTO v_queue_name
            FROM public.queues
            WHERE id = p_queue_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'NOT_FOUND';
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    -- 4. Date range validation
    v_from := COALESCE(p_from, public.today_dhaka());
    v_to := COALESCE(p_to, public.today_dhaka());

    IF v_to < v_from THEN
        RAISE EXCEPTION 'VALIDATION_FAILED';
    END IF;

    IF (v_to - v_from) > 31 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED';
    END IF;

    -- 5. Overall aggregates for the date range
    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE status = 'waiting')::integer,
        count(*) FILTER (WHERE status = 'serving')::integer,
        count(*) FILTER (WHERE status = 'completed')::integer,
        count(*) FILTER (WHERE status = 'skipped')::integer,
        count(*) FILTER (WHERE status = 'cancelled')::integer,
        count(*) FILTER (WHERE status = 'expired')::integer,
        ROUND(AVG(EXTRACT(EPOCH FROM (called_at - issued_at))) FILTER (WHERE called_at IS NOT NULL)::numeric, 1),
        ROUND(AVG(service_seconds) FILTER (WHERE status = 'completed' AND service_seconds IS NOT NULL)::numeric, 1)
    INTO
        v_total_issued,
        v_total_waiting,
        v_total_serving,
        v_total_completed,
        v_total_skipped,
        v_total_cancelled,
        v_total_expired,
        v_avg_wait,
        v_avg_service
    FROM public.tokens
    WHERE service_date >= v_from
      AND service_date <= v_to
      AND (p_queue_id IS NULL OR queue_id = p_queue_id);

    -- 6. Daily breakdown table
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'date', d.day_date,
                'issued', COALESCE(agg.issued, 0),
                'completed', COALESCE(agg.completed, 0),
                'skipped', COALESCE(agg.skipped, 0),
                'cancelled', COALESCE(agg.cancelled, 0),
                'expired', COALESCE(agg.expired, 0),
                'avg_wait_seconds', agg.avg_wait,
                'avg_service_seconds', agg.avg_service
            ) ORDER BY d.day_date DESC
        ),
        '[]'::jsonb
    ) INTO v_daily
    FROM (
        SELECT day_series::date AS day_date
        FROM generate_series(v_from::timestamp, v_to::timestamp, '1 day'::interval) AS day_series
    ) d
    LEFT JOIN (
        SELECT
            service_date,
            count(*)::integer AS issued,
            count(*) FILTER (WHERE status = 'completed')::integer AS completed,
            count(*) FILTER (WHERE status = 'skipped')::integer AS skipped,
            count(*) FILTER (WHERE status = 'cancelled')::integer AS cancelled,
            count(*) FILTER (WHERE status = 'expired')::integer AS expired,
            ROUND(AVG(EXTRACT(EPOCH FROM (called_at - issued_at))) FILTER (WHERE called_at IS NOT NULL)::numeric, 1) AS avg_wait,
            ROUND(AVG(service_seconds) FILTER (WHERE status = 'completed' AND service_seconds IS NOT NULL)::numeric, 1) AS avg_service
        FROM public.tokens
        WHERE service_date >= v_from
          AND service_date <= v_to
          AND (p_queue_id IS NULL OR queue_id = p_queue_id)
        GROUP BY service_date
    ) agg ON agg.service_date = d.day_date;

    -- 7. Hourly breakdown in Asia/Dhaka timezone (0 to 23 hours)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'hour', h.hr,
                'count', COALESCE(counts.c, 0)
            ) ORDER BY h.hr ASC
        ),
        '[]'::jsonb
    ) INTO v_hourly
    FROM (
        SELECT generate_series(0, 23) AS hr
    ) h
    LEFT JOIN (
        SELECT
            EXTRACT(HOUR FROM timezone('Asia/Dhaka', issued_at))::integer AS hr,
            count(*)::integer AS c
        FROM public.tokens
        WHERE service_date >= v_from
          AND service_date <= v_to
          AND (p_queue_id IS NULL OR queue_id = p_queue_id)
        GROUP BY 1
    ) counts ON counts.hr = h.hr;

    -- 8. Return comprehensive summary object
    RETURN jsonb_build_object(
        'queue_id', p_queue_id,
        'queue_name', v_queue_name,
        'from', v_from,
        'to', v_to,
        'total_issued', v_total_issued,
        'total_waiting', v_total_waiting,
        'total_serving', v_total_serving,
        'total_completed', v_total_completed,
        'total_skipped', v_total_skipped,
        'total_cancelled', v_total_cancelled,
        'total_expired', v_total_expired,
        'avg_wait_seconds', v_avg_wait,
        'avg_service_seconds', v_avg_service,
        'daily', v_daily,
        'hourly', v_hourly
    );
END;
$$;

-- =========================================================================
-- 2. pause_queue(p_queue_id)
-- Caller-facing: Pauses a queue, records paused_at, and audits.
-- Blocks Next (advance) and Issue operations (QUEUE_PAUSED).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pause_queue(p_queue_id uuid)
RETURNS public.queue_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_queue_active boolean;
    v_state public.queue_state;
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

    IF NOT FOUND OR v_queue_org_id != v_caller_org_id THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    IF NOT v_queue_active THEN
        RAISE EXCEPTION 'QUEUE_INACTIVE';
    END IF;

    -- 3. Lock queue_state row FOR UPDATE
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- If already paused, return current state idempotently
    IF v_state.status = 'paused' THEN
        RETURN v_state;
    END IF;

    -- 4. Update state to paused
    UPDATE public.queue_state
    SET status = 'paused',
        paused_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE queue_id = p_queue_id
    RETURNING * INTO v_state;

    -- 5. Audit event
    INSERT INTO public.audit_events (queue_id, actor_id, action)
    VALUES (p_queue_id, auth.uid(), 'pause');

    RETURN v_state;
END;
$$;

-- =========================================================================
-- 3. resume_queue(p_queue_id)
-- Caller-facing: Resumes a paused queue and audits.
-- Moves the serving token's called_at forward by the paused duration
-- so the pause never inflates service time.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.resume_queue(p_queue_id uuid)
RETURNS public.queue_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_queue_active boolean;
    v_state public.queue_state;
    v_pause_interval interval;
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

    IF NOT FOUND OR v_queue_org_id != v_caller_org_id THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    IF NOT v_queue_active THEN
        RAISE EXCEPTION 'QUEUE_INACTIVE';
    END IF;

    -- 3. Lock queue_state row FOR UPDATE
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- If not paused, return current state
    IF v_state.status != 'paused' THEN
        RETURN v_state;
    END IF;

    -- 4. Calculate paused interval and shift serving token called_at forward
    IF v_state.paused_at IS NOT NULL THEN
        v_pause_interval := now() - v_state.paused_at;

        UPDATE public.tokens
        SET called_at = called_at + v_pause_interval
        WHERE queue_id = p_queue_id
          AND service_date = v_state.service_date
          AND status = 'serving';
    END IF;

    -- 5. Update state to active
    UPDATE public.queue_state
    SET status = 'active',
        paused_at = NULL,
        version = version + 1,
        updated_at = now()
    WHERE queue_id = p_queue_id
    RETURNING * INTO v_state;

    -- 6. Audit event
    INSERT INTO public.audit_events (queue_id, actor_id, action)
    VALUES (p_queue_id, auth.uid(), 'resume');

    RETURN v_state;
END;
$$;

-- =========================================================================
-- 4. recall_token(p_token_id)
-- Caller-facing: Recalls a skipped token back to waiting status.
-- Works only for a skipped token (TOKEN_NOT_SKIPPED otherwise),
-- and only once per token (ALREADY_RECALLED).
-- The token returns to waiting and, having the lowest waiting number,
-- will be called next when staff click Next.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.recall_token(p_token_id uuid)
RETURNS public.queue_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token RECORD;
    v_caller_org_id uuid;
    v_queue_org_id uuid;
    v_queue_active boolean;
    v_state public.queue_state;
    v_new_waiting_numbers integer[];
BEGIN
    -- 1. Check token existence
    SELECT * INTO v_token
    FROM public.tokens
    WHERE id = p_token_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 2. Check caller profile & queue org ownership
    SELECT q.org_id, q.is_active INTO v_queue_org_id, v_queue_active
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

    IF NOT v_queue_active THEN
        RAISE EXCEPTION 'QUEUE_INACTIVE';
    END IF;

    -- 3. Lock queue_state row FOR UPDATE
    SELECT * INTO v_state
    FROM public.queue_state
    WHERE queue_id = v_token.queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    -- 4. Check token is currently skipped
    IF v_token.status != 'skipped' THEN
        RAISE EXCEPTION 'TOKEN_NOT_SKIPPED';
    END IF;

    -- 5. Check token has not already been recalled (DEC-17)
    IF EXISTS (
        SELECT 1 FROM public.audit_events
        WHERE token_id = p_token_id
          AND action = 'recall'
    ) THEN
        RAISE EXCEPTION 'ALREADY_RECALLED';
    END IF;

    -- 6. Mark token as waiting and reset finished_at
    UPDATE public.tokens
    SET status = 'waiting',
        finished_at = NULL
    WHERE id = p_token_id;

    -- 7. Add token number back into waiting_numbers, sorted ascending
    SELECT array_agg(num ORDER BY num ASC)
    INTO v_new_waiting_numbers
    FROM (
        SELECT unnest(array_append(v_state.waiting_numbers, v_token.number)) AS num
    ) s;

    -- 8. Update queue_state
    UPDATE public.queue_state
    SET waiting_numbers = COALESCE(v_new_waiting_numbers, ARRAY[v_token.number]),
        version = version + 1,
        updated_at = now()
    WHERE queue_id = v_token.queue_id
    RETURNING * INTO v_state;

    -- 9. Audit event
    INSERT INTO public.audit_events (queue_id, token_id, actor_id, action)
    VALUES (v_token.queue_id, p_token_id, auth.uid(), 'recall');

    -- 10. Enqueue near-turn alerts
    PERFORM public.enqueue_near_turn(v_token.queue_id);

    RETURN v_state;
END;
$$;

-- =========================================================================
-- Security & Permissions (Section 15, DEC-08)
-- Revoke all function execute from PUBLIC and anon.
-- Grant to authenticated and service_role.
-- =========================================================================
REVOKE ALL ON FUNCTION public.report_summary(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pause_queue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_queue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recall_token(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.report_summary(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pause_queue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_queue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recall_token(uuid) TO authenticated, service_role;
