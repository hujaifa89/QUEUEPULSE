import { AppError, type ErrorCode } from '@/lib/http';

const ERROR_MAP: Record<string, { code: ErrorCode; status: number; message: string }> = {
  STALE_STATE: {
    code: 'STALE_STATE',
    status: 409,
    message: 'Someone already advanced the queue',
  },
  QUEUE_PAUSED: {
    code: 'QUEUE_PAUSED',
    status: 409,
    message: 'Action not allowed while the queue is paused',
  },
  QUEUE_INACTIVE: {
    code: 'QUEUE_INACTIVE',
    status: 409,
    message: 'Action not allowed on an inactive queue',
  },
  NOTHING_SERVING: {
    code: 'NOTHING_SERVING',
    status: 409,
    message: 'Cannot skip when no token is currently serving',
  },
  TOKEN_NOT_WAITING: {
    code: 'TOKEN_NOT_WAITING',
    status: 409,
    message: 'Action is only allowed on waiting tokens',
  },
  TOKEN_NOT_SKIPPED: {
    code: 'TOKEN_NOT_SKIPPED',
    status: 409,
    message: 'Token is not skipped',
  },
  ALREADY_RECALLED: {
    code: 'ALREADY_RECALLED',
    status: 409,
    message: 'Token has already been recalled',
  },
  DUPLICATE_NAME: {
    code: 'DUPLICATE_NAME',
    status: 409,
    message: 'A queue with this name already exists in your organization',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    status: 404,
    message: 'Resource not found or not accessible',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    status: 403,
    message: 'Forbidden: Insufficient privileges or inactive account/organization',
  },
  UNAUTHENTICATED: {
    code: 'UNAUTHENTICATED',
    status: 401,
    message: 'No valid session',
  },
  VALIDATION_FAILED: {
    code: 'VALIDATION_FAILED',
    status: 400,
    message: 'Validation failed',
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    status: 429,
    message: 'Too many requests',
  },
};

export function mapDatabaseError(err: unknown): AppError {
  const errMsg = err instanceof Error ? err.message : String(err);

  for (const [key, mapping] of Object.entries(ERROR_MAP)) {
    if (errMsg.includes(key)) {
      return new AppError(mapping.code, mapping.status, mapping.message);
    }
  }

  return new AppError('INTERNAL', 500, 'Internal server error');
}
