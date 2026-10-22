export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STALE_STATE'
  | 'QUEUE_PAUSED'
  | 'QUEUE_INACTIVE'
  | 'TOKEN_NOT_WAITING'
  | 'NOTHING_SERVING'
  | 'TOKEN_NOT_SKIPPED'
  | 'ALREADY_RECALLED'
  | 'DUPLICATE_NAME'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STALE_STATE: 409,
  QUEUE_PAUSED: 409,
  QUEUE_INACTIVE: 409,
  TOKEN_NOT_WAITING: 409,
  NOTHING_SERVING: 409,
  TOKEN_NOT_SKIPPED: 409,
  ALREADY_RECALLED: 409,
  DUPLICATE_NAME: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, status?: number, message?: string, details?: unknown) {
    const finalStatus = status ?? ERROR_STATUS_MAP[code] ?? 500;
    const finalMessage = message ?? code;
    super(finalMessage);
    this.name = 'AppError';
    this.code = code;
    this.status = finalStatus;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
