-- Migration 19: Database Health Check Function
-- Phase 10: /api/health database reachability verification (Objective 3)

CREATE OR REPLACE FUNCTION public.health_check()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 1;
$$;

-- Revoke execute from PUBLIC
REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC;

-- Allow anon, authenticated, and service_role to execute health check
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated, service_role;
