-- Migration 07: Realtime Broadcast Trigger on queue_state
-- Blueprint DEC-03 & Phase 2 Specification

CREATE OR REPLACE FUNCTION public.broadcast_queue_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payload jsonb;
    v_topic text;
BEGIN
    v_payload := jsonb_build_object(
        'service_date', NEW.service_date,
        'serving_number', NEW.serving_number,
        'last_issued', NEW.last_issued,
        'waiting_numbers', NEW.waiting_numbers,
        'avg_service_minutes', NEW.avg_service_minutes,
        'status', NEW.status,
        'version', NEW.version
    );
    v_topic := 'queue:' || NEW.queue_id::text;

    BEGIN
        PERFORM realtime.send(
            payload => v_payload,
            topic => v_topic,
            event => 'queue_state_update',
            private => false
        );
    EXCEPTION WHEN OTHERS THEN
        -- Safely log warning if realtime extension is uninitialized
        RAISE WARNING 'Realtime broadcast failed: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- Trigger on queue_state after insert or update
CREATE TRIGGER queue_state_broadcast_trigger
AFTER INSERT OR UPDATE ON public.queue_state
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_queue_state();
