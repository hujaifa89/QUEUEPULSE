import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';

/**
 * Middleware: Refreshes auth sessions and protects role-specific routes.
 * /dashboard and /reports require staff role.
 * /admin requires admin role.
 * Unauthenticated users are redirected to /login.
 * Wrong role sees a 403 page.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const isStaffRoute = path.startsWith('/dashboard') || path.startsWith('/reports');
  const isAdminRoute = path.startsWith('/admin');

  if (isStaffRoute || isAdminRoute) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', path);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.is_active) {
      return NextResponse.redirect(new URL('/login?error=inactive', request.url));
    }

    if (isAdminRoute && profile.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/403';
      return NextResponse.rewrite(url, { status: 403 });
    }

    if (isStaffRoute && profile.role !== 'staff') {
      const url = request.nextUrl.clone();
      url.pathname = '/403';
      return NextResponse.rewrite(url, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/reports/:path*',
    '/admin/:path*',
  ],
};
