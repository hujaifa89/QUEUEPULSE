-- Migration 04: Create push_subscriptions, notification_outbox and audit_events
-- Blueprint Section 14

-- 1. Push Subscriptions Table
CREATE TABLE public.push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Notification Outbox Table
CREATE TABLE public.notification_outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('push', 'sms')),
    kind text NOT NULL CHECK (kind IN ('near_turn')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts smallint NOT NULL DEFAULT 0,
    last_error text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz NULL,
    CONSTRAINT notification_outbox_token_channel_kind_unique UNIQUE (token_id, channel, kind)
);

-- 3. Audit Events Table (SEC-10)
CREATE TABLE public.audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE RESTRICT,
    token_id uuid NULL REFERENCES public.tokens(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action text NOT NULL CHECK (action IN ('issue', 'next', 'skip', 'cancel', 'recall', 'pause', 'resume')),
    created_at timestamptz NOT NULL DEFAULT now()
);
