import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { AppError } from './errors';
import { withHttpHandler } from './handler';
import type { RequestContext } from './types';

export interface UserProfile {
  id: string;
  role: 'staff' | 'admin';
  org_id: string | null;
  full_name: string;
  is_active: boolean;
}

export interface AuthenticatedContext<TParams = unknown> {
  params?: TParams;
  user: User;
  profile: UserProfile;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface WithAuthOptions {
  role?: 'staff' | 'admin';
}

export type AuthenticatedRouteHandler<TParams = unknown, TResponse = unknown> = (
  request: Request,
  context: AuthenticatedContext<TParams>,
  meta: { requestId: string },
) => Promise<Response | TResponse> | Response | TResponse;

/**
 * Validates the Origin header on state-changing requests (SEC-09).
 */
export function validateOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          throw new AppError('FORBIDDEN', 403, 'Cross-origin request rejected');
        }
      } catch (err: unknown) {
        if (err instanceof AppError) {
          throw err;
        }
        throw new AppError('FORBIDDEN', 403, 'Invalid request origin header');
      }
    }
  }
}

/**
 * Route handler wrapper with authentication and role-based access control.
 * Enforces SEC-01, SEC-02, SEC-09, SEC-15.
 */
export function withAuth<TParams = unknown, TResponse = unknown>(
  options: WithAuthOptions,
  handler: AuthenticatedRouteHandler<TParams, TResponse>,
) {
  return withHttpHandler(async (request: Request, rawContext?: RequestContext, meta?: { requestId: string }) => {
    // 1. SEC-09: Origin check on state-changing requests
    validateOrigin(request);

    // 2. Load Supabase server client
    const supabase = await createClient();

    // 3. SEC-01: Verify authenticated session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError('UNAUTHENTICATED', 401, 'No valid session');
    }

    // 4. SEC-02, SEC-15: Load profile from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, org_id, full_name, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.is_active) {
      throw new AppError('FORBIDDEN', 403, 'Account is inactive or profile not found');
    }

    const userProfile = profile as UserProfile;

    // 5. Check role requirement
    if (options.role && userProfile.role !== options.role) {
      throw new AppError('FORBIDDEN', 403, 'Insufficient permissions');
    }

    // 6. If role is staff, verify organization is active
    if (userProfile.role === 'staff') {
      if (!userProfile.org_id) {
        throw new AppError('FORBIDDEN', 403, 'Staff account has no assigned organization');
      }

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('is_active')
        .eq('id', userProfile.org_id)
        .single();

      if (orgError || !org || !org.is_active) {
        throw new AppError('FORBIDDEN', 403, 'Organization is inactive');
      }
    }

    // 7. Invoke handler with authenticated context
    const authContext: AuthenticatedContext<TParams> = {
      params: rawContext?.params as TParams,
      user,
      profile: userProfile,
      supabase,
    };

    return handler(request, authContext, meta ?? { requestId: crypto.randomUUID() });
  });
}
