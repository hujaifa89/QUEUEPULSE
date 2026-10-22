-- Migration 16: AFTER INSERT trigger on queues to initialize queue_state
-- Blueprint Section 14 & Phase 5 Specification

CREATE OR REPLACE FUNCTION public.handle_new_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.queue_state (
        queue_id,
        service_date,
        serving_number,
        last_issued,
        waiting_numbers,
        avg_service_minutes,
        status,
        version
    )
    VALUES (
        NEW.id,
        public.today_dhaka(),
        NULL,
        0,
        '{}'::integer[],
        NEW.default_service_minutes::numeric(5,1),
        'active',
        1
    )
    ON CONFLICT (queue_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Drop trigger if exists and create
DROP TRIGGER IF EXISTS on_queue_created ON public.queues;

CREATE TRIGGER on_queue_created
AFTER INSERT ON public.queues
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_queue();
