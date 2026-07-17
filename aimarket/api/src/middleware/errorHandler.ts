import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';

/** Wrap an async route handler so rejected promises reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Resource not found' },
  });
}

/** Global error handler — serializes AppError and unexpected errors. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: {
      error: { code: string; message: string; details?: unknown };
    } = { error: { code: err.code, message: err.message } };
    if (err.details && err.details.length > 0) {
      body.error.details = err.details;
    }
    res.status(err.status).json(body);
    return;
  }

  // Malformed JSON body from express.json().
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON in request body' },
    });
    return;
  }

  console.error('Unexpected error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
