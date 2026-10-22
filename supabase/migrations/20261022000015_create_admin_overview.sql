-- Migration 15: Admin Overview Function
-- Blueprint Section 15 & Phase 4 Specification

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (
    organizations integer,
    active_queues integer,
    tokens_today integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify caller is active admin (SEC-02, RV-04)
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    RETURN QUERY
    SELECT 
        (SELECT count(*)::integer FROM public.organizations),
        (SELECT count(*)::integer FROM public.queues WHERE is_active = true),
        (SELECT count(*)::integer FROM public.tokens WHERE service_date = public.today_dhaka());
END;
$$;

-- Revoke execute from PUBLIC and anon
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_overview() FROM anon;

-- Grant execute to authenticated (guarded by is_admin()) and service_role
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated, service_role;
