import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withHttpHandler, AppError } from '@/lib/http';
import { createServiceClient } from '@/lib/supabase/service';
import { pushRateLimiter } from '@/features/notifications/rateLimiter';

export const dynamic = 'force-dynamic';

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
  p256dh: z.string().min(1, 'p256dh key is required'),
  auth: z.string().min(1, 'auth secret is required'),
});

export const POST = withHttpHandler<{ code: string }>(async (request, context) => {
  const code = context?.params?.code;
  if (!code) {
    throw new AppError('NOT_FOUND', 404, 'Token code not provided');
  }

  // 1. Best-effort rate limiting: 10 requests per minute per IP + code (DEC-13)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
  const rateLimitKey = `${ip}:${code}`;

  const rateCheck = pushRateLimiter.check(rateLimitKey);
  if (!rateCheck.allowed) {
    throw new AppError('RATE_LIMITED', 429, 'Too many push subscription requests. Please try again later.');
  }

  // 2. Validate input body
  const body = await request.json();
  const parsed = pushSubscriptionSchema.parse(body);

  // 3. Register push subscription using service role client (Architecture Rule 6)
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('register_push', {
    p_code: code,
    p_endpoint: parsed.endpoint,
    p_p256dh: parsed.p256dh,
    p_auth: parsed.auth,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('NOT_FOUND')) {
      throw new AppError('NOT_FOUND', 404, 'Token not found');
    }
    if (msg.includes('TOKEN_NOT_WAITING')) {
      throw new AppError('TOKEN_NOT_WAITING', 409, 'Token is not active for push alerts');
    }
    throw new AppError('INTERNAL', 500, error.message);
  }

  return NextResponse.json({ success: true, subscription_id: data }, { status: 201 });
});
