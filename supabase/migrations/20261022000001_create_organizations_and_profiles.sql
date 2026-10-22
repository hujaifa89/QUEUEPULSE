-- Migration 01: Create organizations and profiles with helper functions
-- Blueprint Section 14

-- 1. Organizations Table
CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organizations_name_len CHECK (char_length(name) >= 2 AND char_length(name) <= 80)
);

-- 2. Profiles Table
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('admin', 'staff')),
    org_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
    full_name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_name_len CHECK (char_length(full_name) >= 2 AND char_length(full_name) <= 80),
    CONSTRAINT profiles_role_org_check CHECK (
        (role = 'staff' AND org_id IS NOT NULL) OR
        (role = 'admin' AND org_id IS NULL)
    )
);

-- 3. Helper Functions: current_org_id() and is_admin()
-- SECURITY DEFINER, STABLE, fixed search_path = public
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.org_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.is_active = true
      AND o.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
          AND p.is_active = true
    );
$$;

-- Revoke EXECUTE from PUBLIC
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
