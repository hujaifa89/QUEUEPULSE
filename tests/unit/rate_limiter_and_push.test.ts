import { InMemoryRateLimiter, pushRateLimiter } from '@/features/notifications/rateLimiter';
import { pushSubscriptionSchema, POST } from '@/app/api/public/tokens/[code]/push/route';
import { createServiceClient } from '@/lib/supabase/service';

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn(),
}));

describe('InMemoryRateLimiter (DEC-13, SEC-08)', () => {
  it('allows requests within threshold and blocks subsequent calls', () => {
    const limiter = new InMemoryRateLimiter(3, 1000);
    const key = '127.0.0.1:code-1';

    expect(limiter.check(key).allowed).toBe(true);
    expect(limiter.check(key).allowed).toBe(true);
    expect(limiter.check(key).allowed).toBe(true);

    // 4th request must be blocked
    const fourth = limiter.check(key);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('tracks different keys independently', () => {
    const limiter = new InMemoryRateLimiter(2, 1000);
    expect(limiter.check('ip1:code').allowed).toBe(true);
    expect(limiter.check('ip1:code').allowed).toBe(true);
    expect(limiter.check('ip1:code').allowed).toBe(false);

    // ip2 should still be allowed
    expect(limiter.check('ip2:code').allowed).toBe(true);
  });

  it('resets quota after window expiration', () => {
    const limiter = new InMemoryRateLimiter(1, 50); // 50ms window
    const key = 'test-expire';

    expect(limiter.check(key).allowed).toBe(true);
    expect(limiter.check(key).allowed).toBe(false);

    // Advance time beyond window
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 100);

    expect(limiter.check(key).allowed).toBe(true);

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('cleans up expired entries', () => {
    const limiter = new InMemoryRateLimiter(2, 100);
    limiter.check('key-to-clean');

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 200);

    limiter.cleanup();
    // After cleanup, checking key starts fresh count
    expect(limiter.check('key-to-clean').remaining).toBe(1);

    jest.spyOn(Date, 'now').mockRestore();
  });
});

describe('Push Subscription Schema Validation (SEC-05)', () => {
  it('validates a correct push subscription body', () => {
    const valid = {
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB...',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0AIdBgHB0ok0f8N...',
      auth: 'tBHItJI5svbpez7KI4CCXg==',
    };

    const parsed = pushSubscriptionSchema.parse(valid);
    expect(parsed.endpoint).toBe(valid.endpoint);
    expect(parsed.p256dh).toBe(valid.p256dh);
    expect(parsed.auth).toBe(valid.auth);
  });

  it('rejects invalid or missing endpoint URL', () => {
    expect(() =>
      pushSubscriptionSchema.parse({
        endpoint: 'not-a-valid-url',
        p256dh: 'key',
        auth: 'secret',
      }),
    ).toThrow();

    expect(() =>
      pushSubscriptionSchema.parse({
        p256dh: 'key',
        auth: 'secret',
      }),
    ).toThrow();
  });

  it('rejects missing p256dh or auth keys', () => {
    expect(() =>
      pushSubscriptionSchema.parse({
        endpoint: 'https://push.example.com',
        p256dh: '',
        auth: 'secret',
      }),
    ).toThrow();

    expect(() =>
      pushSubscriptionSchema.parse({
        endpoint: 'https://push.example.com',
        p256dh: 'key',
        auth: '',
      }),
    ).toThrow();
  });
});

describe('POST /api/public/tokens/[code]/push Route Handler', () => {
  const mockRpc = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    pushRateLimiter.reset();
    (createServiceClient as jest.Mock).mockReturnValue({
      rpc: mockRpc,
    });
  });

  const validPayload = {
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB12345',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0AIdBgHB0ok0f8N',
    auth: 'tBHItJI5svbpez7KI4CCXg==',
  };

  it('successfully registers push subscription and returns 201', async () => {
    mockRpc.mockResolvedValueOnce({
      data: '00000000-0000-0000-0000-000000000001',
      error: null,
    });

    const request = new Request('http://localhost/api/public/tokens/valid-code/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.1',
      },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request, { params: { code: 'valid-code' } });
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.subscription_id).toBe('00000000-0000-0000-0000-000000000001');

    expect(mockRpc).toHaveBeenCalledWith('register_push', {
      p_code: 'valid-code',
      p_endpoint: validPayload.endpoint,
      p_p256dh: validPayload.p256dh,
      p_auth: validPayload.auth,
    });
  });

  it('returns 400 when body payload is invalid', async () => {
    const request = new Request('http://localhost/api/public/tokens/valid-code/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.2',
      },
      body: JSON.stringify({ endpoint: 'invalid-url' }),
    });

    const response = await POST(request, { params: { code: 'valid-code' } });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 when token code is not found in database', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'NOT_FOUND: Token not found' },
    });

    const request = new Request('http://localhost/api/public/tokens/nonexistent/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.3',
      },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request, { params: { code: 'nonexistent' } });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 409 when token is not waiting or active', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'TOKEN_NOT_WAITING' },
    });

    const request = new Request('http://localhost/api/public/tokens/completed-code/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.4',
      },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request, { params: { code: 'completed-code' } });
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error.code).toBe('TOKEN_NOT_WAITING');
  });

  it('returns 429 when rate limit is exceeded for the same IP and code', async () => {
    // Fire 11 requests from the same IP + code
    const ip = '203.0.113.99';
    const code = 'spam-test-code';

    mockRpc.mockResolvedValue({
      data: 'sub-uuid',
      error: null,
    });

    let lastResponse: any;
    for (let i = 0; i < 11; i++) {
      const request = new Request(`http://localhost/api/public/tokens/${code}/push`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify(validPayload),
      });

      lastResponse = await POST(request, { params: { code } });
    }

    expect(lastResponse.status).toBe(429);
    const body = await lastResponse.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});

