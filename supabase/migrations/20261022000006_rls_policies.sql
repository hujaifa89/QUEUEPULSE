-- Migration 06: Row Level Security policies and privilege controls
-- Blueprint Section 14

-- 1. Enable RLS on all 8 tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- 2. Organizations Policies
-- Staff: read own organization
CREATE POLICY organizations_staff_select ON public.organizations
    FOR SELECT TO authenticated
    USING (id = public.current_org_id());

-- Admin: read, create, update
CREATE POLICY organizations_admin_all ON public.organizations
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 3. Profiles Policies
-- Staff: read own profile row
CREATE POLICY profiles_staff_select_own ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() AND is_active = true);

-- Admin: read, create (via server), update
CREATE POLICY profiles_admin_select ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY profiles_admin_insert ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY profiles_admin_update ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4. Queues Policies
-- Staff: read, create, update in own organization
CREATE POLICY queues_staff_select ON public.queues
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

CREATE POLICY queues_staff_insert ON public.queues
    FOR INSERT TO authenticated
    WITH CHECK (org_id = public.current_org_id());

CREATE POLICY queues_staff_update ON public.queues
    FOR UPDATE TO authenticated
    USING (org_id = public.current_org_id())
    WITH CHECK (org_id = public.current_org_id());

-- Admin: read all queues
CREATE POLICY queues_admin_select ON public.queues
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- 5. Queue State Policies
-- Staff: read in own organization
CREATE POLICY queue_state_staff_select ON public.queue_state
    FOR SELECT TO authenticated
    USING (queue_id IN (SELECT q.id FROM public.queues q WHERE q.org_id = public.current_org_id()));

-- Admin: read all queue_state
CREATE POLICY queue_state_admin_select ON public.queue_state
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- 6. Tokens Policies
-- Staff: read in own organization
CREATE POLICY tokens_staff_select ON public.tokens
    FOR SELECT TO authenticated
    USING (queue_id IN (SELECT q.id FROM public.queues q WHERE q.org_id = public.current_org_id()));

-- 7. Audit Events Policies
-- Admin: read all audit events
CREATE POLICY audit_events_admin_select ON public.audit_events
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- 8. Note: push_subscriptions and notification_outbox have NO policies for anon or authenticated (server-only via service_role)
-- No INSERT, UPDATE or DELETE policies on tokens, queue_state, push_subscriptions, notification_outbox, audit_events

-- 9. Revoke all privileges from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Grant required table privileges to authenticated
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.queues TO authenticated;
GRANT SELECT ON public.queue_state TO authenticated;
GRANT SELECT ON public.tokens TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
