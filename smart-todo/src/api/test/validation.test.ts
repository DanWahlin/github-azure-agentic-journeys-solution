import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCreateTodo,
  validateUpdateTodo,
  validateUpdateStep,
  validateUserId,
} from '../src/validation.ts';
import { ApiError } from '../src/models/errors.ts';

test('validateCreateTodo trims title and requires userId', () => {
  const input = validateCreateTodo({ title: '  Prepare talk  ', userId: 'user-1' });
  assert.equal(input.title, 'Prepare talk');
  assert.equal(input.userId, 'user-1');
});

test('validateCreateTodo rejects empty title', () => {
  assert.throws(() => validateCreateTodo({ title: '   ', userId: 'user-1' }), (e) => e instanceof ApiError && e.code === 'VALIDATION_ERROR');
});

test('validateCreateTodo rejects title over 500 chars', () => {
  assert.throws(() => validateCreateTodo({ title: 'a'.repeat(501), userId: 'user-1' }), ApiError);
});

test('validateCreateTodo rejects missing userId', () => {
  assert.throws(() => validateCreateTodo({ title: 'ok' }), (e) => e instanceof ApiError && e.status === 400);
});

test('validateUpdateTodo accepts valid status', () => {
  assert.deepEqual(validateUpdateTodo({ status: 'in_progress' }), { status: 'in_progress' });
});

test('validateUpdateTodo rejects invalid status', () => {
  assert.throws(() => validateUpdateTodo({ status: 'not_started' }), (e) => e instanceof ApiError && e.code === 'VALIDATION_ERROR');
});

test('validateUpdateTodo supports stepsGenerated flag', () => {
  assert.deepEqual(validateUpdateTodo({ stepsGenerated: true }), { stepsGenerated: true });
});

test('validateUpdateStep requires boolean isCompleted', () => {
  assert.deepEqual(validateUpdateStep({ isCompleted: true }), { isCompleted: true });
  assert.throws(() => validateUpdateStep({ isCompleted: 'yes' }), ApiError);
});

test('validateUserId rejects empty', () => {
  assert.throws(() => validateUserId(''), ApiError);
  assert.equal(validateUserId('user-1'), 'user-1');
});
