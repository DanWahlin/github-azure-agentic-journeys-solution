import type { FieldError } from '../errors.js';
import { Validator, isStringInRange, isValidEmail } from './validation.js';

export const USER_ROLES = ['buyer', 'seller'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
}

export function validateCreateUser(input: unknown): FieldError[] {
  const v = new Validator();
  if (typeof input !== 'object' || input === null) {
    v.add('body', 'Request body must be a JSON object');
    return v.errors;
  }
  const u = input as Record<string, unknown>;

  if (!isValidEmail(u.email)) v.add('email', 'A valid email is required');
  if (!isStringInRange(u.name, 1, 100)) v.add('name', 'Name must be 1-100 characters');
  if (typeof u.role !== 'string' || !USER_ROLES.includes(u.role as UserRole)) {
    v.add('role', `Role must be one of: ${USER_ROLES.join(', ')}`);
  }

  return v.errors;
}
