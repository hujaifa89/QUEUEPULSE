/**
 * Best-effort in-memory rate limiter for public endpoints (DEC-13).
 *
 * NOTE: On serverless environments (such as Vercel), serverless functions scale
 * across multiple ephemeral container instances. In-memory rate limiting is therefore
 * best-effort per instance and complements edge/platform network protections.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private store = new Map<string, RateLimitRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Checks whether the given key has exceeded the allowed rate limit.
   * Returns { allowed: boolean, remaining: number, resetAt: number }.
   */
  public check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetAt) {
      // First request in a new window
      const newRecord: RateLimitRecord = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.store.set(key, newRecord);
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: newRecord.resetAt,
      };
    }

    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
      };
    }

    record.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  /**
   * Clears expired keys to prevent memory leaks over time.
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetAt) {
        this.store.delete(key);
      }
    }
  }

  public reset(): void {
    this.store.clear();
  }
}

// Global instance: 10 requests per minute per IP + token code
export const pushRateLimiter = new InMemoryRateLimiter(10, 60000);
