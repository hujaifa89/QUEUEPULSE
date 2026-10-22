import { validateEnv } from '@/lib/env';

describe('Environment validation (validateEnv)', () => {
  const validFullEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    VAPID_PRIVATE_KEY: 'test-vapid-private-key',
    VAPID_SUBJECT: 'mailto:admin@example.com',
    SMS_PROVIDER: 'mock',
    CRON_SECRET: 'test-cron-secret-1234567890',
  };

  it('validates a complete valid environment on the server', () => {
    const result = validateEnv(validFullEnv, true);
    expect(result.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(result.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key');
    expect(result.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe('test-vapid-public-key');
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('test-service-role-key');
    expect(result.VAPID_PRIVATE_KEY).toBe('test-vapid-private-key');
    expect(result.VAPID_SUBJECT).toBe('mailto:admin@example.com');
    expect(result.SMS_PROVIDER).toBe('mock');
    expect(result.CRON_SECRET).toBe('test-cron-secret-1234567890');
  });

  it('defaults SMS_PROVIDER to "mock" when omitted', () => {
    const { SMS_PROVIDER: _removed, ...envWithoutSms } = validFullEnv;
    const result = validateEnv(envWithoutSms, true);
    expect(result.SMS_PROVIDER).toBe('mock');
  });

  it('fails at start-up with a clear error message listing every missing variable when multiple are missing', () => {
    const emptyEnv = {};

    expect(() => validateEnv(emptyEnv, true)).toThrowError(
      /Environment validation failed\. The following environment variables are missing or invalid:/,
    );

    try {
      validateEnv(emptyEnv, true);
      throw new Error('Should have thrown');
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(msg).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      expect(msg).toContain('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
      expect(msg).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(msg).toContain('VAPID_PRIVATE_KEY');
      expect(msg).toContain('VAPID_SUBJECT');
      expect(msg).toContain('CRON_SECRET');
    }
  });

  it('fails if NEXT_PUBLIC_SUPABASE_URL is not a valid URL', () => {
    const invalidUrlEnv = {
      ...validFullEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-valid-url',
    };

    expect(() => validateEnv(invalidUrlEnv, true)).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it('allows client validation without server-only variables', () => {
    const clientOnlyEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-vapid-public-key',
    };

    const result = validateEnv(clientOnlyEnv, false);
    expect(result.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(result.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key');
    expect(result.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe('test-vapid-public-key');
  });

  it('fails client validation if a public variable is missing', () => {
    const incompleteClientEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      // missing anon key and vapid key
    };

    expect(() => validateEnv(incompleteClientEnv, false)).toThrowError(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });
});
