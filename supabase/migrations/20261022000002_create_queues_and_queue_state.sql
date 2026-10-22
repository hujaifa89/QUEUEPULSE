-- Migration 02: Create queues and queue_state
-- Blueprint Section 14

-- 1. Queues Table
CREATE TABLE public.queues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    name text NOT NULL,
    default_service_minutes smallint NOT NULL DEFAULT 5,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT queues_name_len CHECK (char_length(name) >= 2 AND char_length(name) <= 60),
    CONSTRAINT queues_default_service_minutes_check CHECK (default_service_minutes >= 1 AND default_service_minutes <= 120),
    CONSTRAINT queues_org_id_name_unique UNIQUE (org_id, name)
);

-- 2. Queue State Table (One row per queue; public counters)
CREATE TABLE public.queue_state (
    queue_id uuid PRIMARY KEY REFERENCES public.queues(id) ON DELETE RESTRICT,
    service_date date NOT NULL,
    serving_number integer NULL,
    last_issued integer NOT NULL DEFAULT 0,
    waiting_numbers integer[] NOT NULL DEFAULT '{}'::integer[],
    avg_service_minutes numeric(5,1) NOT NULL,
    status text NOT NULL CHECK (status IN ('active', 'paused')),
    paused_at timestamptz NULL,
    version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);
