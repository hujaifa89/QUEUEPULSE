import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './errors';
import type { ApiErrorResponse, RequestContext, RouteHandler } from './types';

export function withHttpHandler<TContext = RequestContext, TResponse = unknown>(
  handler: RouteHandler<TContext, TResponse>,
) {
  return async (request: Request, context?: TContext): Promise<Response> => {
    const requestId = crypto.randomUUID();

    try {
      const result = await handler(request, context, { requestId });

      if (result instanceof Response) {
        result.headers.set('x-request-id', requestId);
        return result;
      }

      return NextResponse.json(result, {
        headers: {
          'x-request-id': requestId,
        },
      });
    } catch (err: unknown) {
      if (err instanceof AppError) {
        const errorBody: ApiErrorResponse = {
          error: {
            code: err.code,
            message: err.message,
            requestId,
          },
        };
        return NextResponse.json(errorBody, {
          status: err.status,
          headers: {
            'x-request-id': requestId,
          },
        });
      }

      if (err instanceof ZodError) {
        const message = err.issues
          .map((issue) => `${issue.path.join('.') || 'field'}: ${issue.message}`)
          .join(', ');

        const errorBody: ApiErrorResponse = {
          error: {
            code: 'VALIDATION_FAILED',
            message: message || 'Validation failed',
            requestId,
          },
        };
        return NextResponse.json(errorBody, {
          status: 400,
          headers: {
            'x-request-id': requestId,
          },
        });
      }

      // SEC-12: Clean errors. Unhandled internal error: log requestId with actual error, but return generic message to client.
      console.error(`[${requestId}] Internal Server Error:`, err);

      const errorBody: ApiErrorResponse = {
        error: {
          code: 'INTERNAL',
          message: 'Internal server error',
          requestId,
        },
      };

      return NextResponse.json(errorBody, {
        status: 500,
        headers: {
          'x-request-id': requestId,
        },
      });
    }
  };
}

// Alias for convenience
export const apiHandler = withHttpHandler;
