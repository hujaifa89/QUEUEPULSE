import { z } from 'zod';

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_URL is required')
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is required'),
});

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  VAPID_PRIVATE_KEY: z
    .string()
    .min(1, 'VAPID_PRIVATE_KEY is required'),
  VAPID_SUBJECT: z
    .string()
    .min(1, 'VAPID_SUBJECT is required'),
  SMS_PROVIDER: z
    .string()
    .min(1)
    .default('mock'),
  CRON_SECRET: z
    .string()
    .min(1, 'CRON_SECRET is required'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type Env = PublicEnv & ServerEnv;

export function formatEnvErrors(issues: z.ZodIssue[]): string {
  const missingOrInvalid = issues.map((issue) => {
    const key = issue.path.join('.');
    return `  - ${key}: ${issue.message}`;
  });
  return `Environment validation failed. The following environment variables are missing or invalid:\n${missingOrInvalid.join('\n')}`;
}

export function validateEnv(
  rawEnv: Record<string, string | undefined> = process.env,
  isServer = typeof window === 'undefined',
): Env {
  const publicResult = publicEnvSchema.safeParse(rawEnv);
  const issues: z.ZodIssue[] = [];

  if (!publicResult.success) {
    issues.push(...publicResult.error.issues);
  }

  if (isServer) {
    const serverResult = serverEnvSchema.safeParse(rawEnv);
    if (!serverResult.success) {
      issues.push(...serverResult.error.issues);
    }

    if (issues.length > 0) {
      throw new Error(formatEnvErrors(issues));
    }

    return {
      ...publicResult.data!,
      ...serverResult.data!,
    };
  }

  if (issues.length > 0) {
    throw new Error(formatEnvErrors(issues));
  }

  // Client environment: server vars are not exposed
  return publicResult.data as Env;
}

// Next.js only inlines NEXT_PUBLIC_* variables into client bundles when they are
// referenced literally, so collect them explicitly instead of passing process.env.
function readRawEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  };
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(readRawEnv());
  }
  return cachedEnv;
}

// Validation is deferred until a variable is first read (at request time), so that
// `next build` can import route modules without runtime secrets being present.
// In client environments, access to server-only variables is rejected.
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    const isServer = typeof window === 'undefined';
    if (!isServer && prop in serverEnvSchema.shape) {
      throw new Error(`Security Error: Cannot access server-only environment variable "${prop}" on the client.`);
    }
    // Unit test harness without env configured: fall back to raw values
    if (process.env.NODE_ENV === 'test' && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return readRawEnv()[prop];
    }
    try {
      return getEnv()[prop as keyof Env];
    } catch (error) {
      console.error((error as Error).message);
      throw error;
    }
  },
});
