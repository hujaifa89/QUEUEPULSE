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

// In client environments, prevent access to server-only variables
function createEnvProxy(parsedEnv: Partial<Env>): Env {
  const isServer = typeof window === 'undefined';
  return new Proxy(parsedEnv as Env, {
    get(target, prop: string) {
      if (!isServer && prop in serverEnvSchema.shape) {
        throw new Error(`Security Error: Cannot access server-only environment variable "${prop}" on the client.`);
      }
      return target[prop as keyof Env];
    },
  });
}

// Parse at start-up if not in a pure test mock environment where process.env might be empty
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

// Default export / named export
export const env = (function () {
  // If running in Node or browser runtime during execution, validate process.env
  // When running unit tests specifically for env validation, we let tests invoke validateEnv directly
  if (process.env.NODE_ENV === 'test' && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Return proxy with fallback for unit test harness
    return createEnvProxy(process.env as unknown as Partial<Env>);
  }
  try {
    const validated = validateEnv(process.env);
    return createEnvProxy(validated);
  } catch (error) {
    // Fail immediately at start-up
    console.error((error as Error).message);
    throw error;
  }
})();
