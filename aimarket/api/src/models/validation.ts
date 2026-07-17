import type { FieldError } from '../errors.js';

/**
 * Validate that a value is a price with at most two decimal places.
 *
 * IMPORTANT: This intentionally avoids the unsafe pattern
 * `Math.round(value * 100) === value * 100`, which compares an integer against
 * an unrounded IEEE-754 product and produces false negatives (e.g. 64.99).
 *
 * Approach: require a finite, strictly positive number, then round to the
 * nearest cent and compare the reconstructed value back against the input with
 * a small epsilon tolerance. Accepts 64.99 and 0.1; rejects 64.991, NaN,
 * +Infinity, and -Infinity.
 */
export function isValidPrice(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value <= 0) return false;
  const cents = Math.round(value * 100);
  const normalized = cents / 100;
  return Math.abs(value - normalized) < 1e-9;
}

/** Round a valid monetary amount to two decimal places (integer-cents based). */
export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isStringInRange(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value);
}

/**
 * A URL is acceptable if it is an empty string or a syntactically valid
 * http(s) URL.
 */
export function isValidImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Accumulates `{ field, message }` errors for a single validation pass. */
export class Validator {
  readonly errors: FieldError[] = [];

  add(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  get valid(): boolean {
    return this.errors.length === 0;
  }
}
