import type { ErrorCode } from './errors';

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface RequestContext {
  params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
}

export type RouteHandler<TContext = RequestContext, TResponse = unknown> = (
  request: Request,
  context?: TContext,
  meta?: { requestId: string },
) => Promise<Response | TResponse> | Response | TResponse;
