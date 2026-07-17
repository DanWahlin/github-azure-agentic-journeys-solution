export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'AI_SERVICE_ERROR' | 'INTERNAL_ERROR';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  AI_SERVICE_ERROR: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
  }

  static validation(message: string): ApiError {
    return new ApiError('VALIDATION_ERROR', message);
  }

  static notFound(message: string): ApiError {
    return new ApiError('NOT_FOUND', message);
  }

  static aiService(message: string): ApiError {
    return new ApiError('AI_SERVICE_ERROR', message);
  }

  static internal(message: string): ApiError {
    return new ApiError('INTERNAL_ERROR', message);
  }
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message } } };
}
