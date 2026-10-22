-- Migration 05: Create all indexes from Section 14
-- Blueprint Section 14

-- 1. tokens (queue_id, service_date, status, number)
CREATE INDEX idx_tokens_queue_date_status_number 
ON public.tokens (queue_id, service_date, status, number);

-- 2. tokens (queue_id, finished_at DESC) WHERE status = 'completed'
CREATE INDEX idx_tokens_completed_recent 
ON public.tokens (queue_id, finished_at DESC) 
WHERE status = 'completed';

-- 3. tokens (service_date)
CREATE INDEX idx_tokens_service_date 
ON public.tokens (service_date);

-- 4. notification_outbox (created_at) WHERE status = 'pending'
CREATE INDEX idx_notification_outbox_pending 
ON public.notification_outbox (created_at) 
WHERE status = 'pending';

-- 5. profiles (org_id)
CREATE INDEX idx_profiles_org_id 
ON public.profiles (org_id);

-- 6. queues (org_id)
CREATE INDEX idx_queues_org_id 
ON public.queues (org_id);

-- 7. audit_events (queue_id, created_at)
CREATE INDEX idx_audit_events_queue_created 
ON public.audit_events (queue_id, created_at);
