-- Migration 03: Create tokens table
-- Blueprint Section 14

CREATE TABLE public.tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE RESTRICT,
    service_date date NOT NULL,
    number integer NOT NULL CHECK (number >= 1),
    public_code text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'serving', 'completed', 'skipped', 'cancelled', 'expired')),
    phone text NULL,
    request_id uuid NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    called_at timestamptz NULL,
    finished_at timestamptz NULL,
    service_seconds integer NULL,
    CONSTRAINT tokens_queue_date_number_unique UNIQUE (queue_id, service_date, number),
    CONSTRAINT tokens_public_code_len CHECK (char_length(public_code) = 22),
    CONSTRAINT tokens_phone_check CHECK (phone IS NULL OR phone ~ '^\+8801[3-9][0-9]{8}$'),
    CONSTRAINT tokens_queue_request_id_unique UNIQUE (queue_id, request_id),
    CONSTRAINT tokens_called_at_when_serving CHECK (status != 'serving' OR called_at IS NOT NULL),
    CONSTRAINT tokens_service_seconds_when_completed CHECK (status != 'completed' OR service_seconds IS NOT NULL)
);
