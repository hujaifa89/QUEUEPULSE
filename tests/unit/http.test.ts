import { z } from 'zod';
import { AppError, ERROR_STATUS_MAP, withHttpHandler } from '@/lib/http';

describe('HTTP Utilities & Handler Wrapper', () => {
  describe('AppError', () => {
    it('initializes with code, status and message', () => {
      const err = new AppError('TOKEN_NOT_WAITING', 409, 'Token is not in waiting state');
      expect(err.code).toBe('TOKEN_NOT_WAITING');
      expect(err.status).toBe(409);
      expect(err.message).toBe('Token is not in waiting state');
    });

    it('uses default status from ERROR_STATUS_MAP when status is omitted', () => {
      const err = new AppError('FORBIDDEN');
      expect(err.code).toBe('FORBIDDEN');
      expect(err.status).toBe(ERROR_STATUS_MAP.FORBIDDEN);
      expect(err.status).toBe(403);
    });

    it('correctly maps Section 15 error codes to their expected HTTP statuses', () => {
      expect(new AppError('VALIDATION_FAILED').status).toBe(400);
      expect(new AppError('UNAUTHENTICATED').status).toBe(401);
      expect(new AppError('FORBIDDEN').status).toBe(403);
      expect(new AppError('NOT_FOUND').status).toBe(404);
      expect(new AppError('STALE_STATE').status).toBe(409);
      expect(new AppError('QUEUE_PAUSED').status).toBe(409);
      expect(new AppError('QUEUE_INACTIVE').status).toBe(409);
      expect(new AppError('TOKEN_NOT_WAITING').status).toBe(409);
      expect(new AppError('NOTHING_SERVING').status).toBe(409);
      expect(new AppError('TOKEN_NOT_SKIPPED').status).toBe(409);
      expect(new AppError('ALREADY_RECALLED').status).toBe(409);
      expect(new AppError('DUPLICATE_NAME').status).toBe(409);
      expect(new AppError('RATE_LIMITED').status).toBe(429);
      expect(new AppError('INTERNAL').status).toBe(500);
    });
  });

  describe('withHttpHandler', () => {
    const dummyRequest = new Request('https://queuepulse.local/api/test');

    it('returns successful JSON response with x-request-id header', async () => {
      const handler = withHttpHandler(async () => {
        return { success: true, count: 5 };
      });

      const response = await handler(dummyRequest);
      expect(response.status).toBe(200);

      const requestId = response.headers.get('x-request-id');
      expect(requestId).toBeDefined();
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const data = await response.json();
      expect(data).toEqual({ success: true, count: 5 });
    });

    it('handles AppError and maps to structured error JSON', async () => {
      const handler = withHttpHandler(async () => {
        throw new AppError('STALE_STATE', 409, 'Someone already advanced the queue');
      });

      const response = await handler(dummyRequest);
      expect(response.status).toBe(409);

      const requestId = response.headers.get('x-request-id');
      expect(requestId).toBeDefined();

      const data = await response.json();
      expect(data).toEqual({
        error: {
          code: 'STALE_STATE',
          message: 'Someone already advanced the queue',
          requestId,
        },
      });
    });

    it('handles ZodError and maps to VALIDATION_FAILED with 400', async () => {
      const schema = z.object({
        email: z.string().email('Invalid email address'),
        number: z.number().min(1, 'Number must be at least 1'),
      });

      const handler = withHttpHandler(async () => {
        schema.parse({ email: 'not-an-email', number: 0 });
      });

      const response = await handler(dummyRequest);
      expect(response.status).toBe(400);

      const requestId = response.headers.get('x-request-id');
      expect(requestId).toBeDefined();

      const data = await response.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
      expect(data.error.requestId).toBe(requestId);
      expect(data.error.message).toContain('email: Invalid email address');
      expect(data.error.message).toContain('number: Number must be at least 1');
    });

    it('handles unexpected errors, maps to INTERNAL 500, logs requestId, and hides internal details', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const handler = withHttpHandler(async () => {
        throw new Error('Database connection string password leaked or syntax error in postgres');
      });

      const response = await handler(dummyRequest);
      expect(response.status).toBe(500);

      const requestId = response.headers.get('x-request-id');
      expect(requestId).toBeDefined();

      const data = await response.json();
      // Verify no internal message or SQL text leaked to client (SEC-12)
      expect(data).toEqual({
        error: {
          code: 'INTERNAL',
          message: 'Internal server error',
          requestId,
        },
      });
      expect(data.error.message).not.toContain('Database');
      expect(data.error.message).not.toContain('postgres');

      // Verify server log has requestId and original error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[${requestId}] Internal Server Error:`),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
