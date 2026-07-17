export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_EMAIL'
  | 'INSUFFICIENT_INVENTORY'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Application error carrying an HTTP status, a machine-readable code, and
 * optional validation `details`. The global error handler serializes these
 * into the documented `{ error: { code, message, details } }` envelope.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: FieldError[];

  constructor(status: number, code: ErrorCode, message: string, details?: FieldError[]) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static validation(details: FieldError[], message = 'Validation failed'): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static duplicateEmail(message = 'A user with this email already exists'): AppError {
    return new AppError(400, 'DUPLICATE_EMAIL', message);
  }

  static insufficientInventory(message: string): AppError {
    return new AppError(400, 'INSUFFICIENT_INVENTORY', message);
  }
}
