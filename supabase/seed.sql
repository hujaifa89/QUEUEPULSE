-- Seed Data for QueuePulse Local Development
-- Blueprint Section 14 & Phase 2 Specification

-- 1. Insert 2 Organizations
INSERT INTO public.organizations (id, name, is_active)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Dhaka Central Clinic', true),
    ('a0000000-0000-0000-0000-000000000002', 'Uttara Diagnostic Center', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert 3 Queues (2 in Org 1, 1 in Org 2)
INSERT INTO public.queues (id, org_id, name, default_service_minutes, is_active)
VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'General Medicine', 10, true),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Pediatrics', 15, true),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Blood Sample Collection', 5, true)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Queue State rows for each queue
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
VALUES 
    ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, NULL, 0, '{}', 10.0, 'active', 1),
    ('b0000000-0000-0000-0000-000000000002', CURRENT_DATE, NULL, 0, '{}', 15.0, 'active', 1),
    ('b0000000-0000-0000-0000-000000000003', CURRENT_DATE, NULL, 0, '{}', 5.0, 'active', 1)
ON CONFLICT (queue_id) DO NOTHING;
