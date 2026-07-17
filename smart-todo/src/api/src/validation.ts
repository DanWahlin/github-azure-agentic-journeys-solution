import { ApiError } from './models/errors.js';
import { isTodoStatus, type CreateTodoInput, type UpdateTodoInput } from './models/todo.js';

const TITLE_MAX = 500;
const STEP_TITLE_MAX = 200;
const STEP_DESC_MAX = 1000;

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.validation('Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

export function validateUserId(userId: unknown): string {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw ApiError.validation('userId is required and must be a non-empty string.');
  }
  return userId;
}

export function validateCreateTodo(body: unknown): CreateTodoInput {
  const record = asRecord(body);
  const rawTitle = record.title;
  if (typeof rawTitle !== 'string') {
    throw ApiError.validation('Title is required and must be between 1 and 500 characters.');
  }
  const title = rawTitle.trim();
  if (title.length < 1 || title.length > TITLE_MAX) {
    throw ApiError.validation('Title is required and must be between 1 and 500 characters.');
  }
  const userId = validateUserId(record.userId);
  return { title, userId };
}

export function validateUpdateTodo(body: unknown): UpdateTodoInput {
  const record = asRecord(body);
  const updates: UpdateTodoInput = {};

  if (record.title !== undefined) {
    if (typeof record.title !== 'string') {
      throw ApiError.validation('Title must be between 1 and 500 characters.');
    }
    const title = record.title.trim();
    if (title.length < 1 || title.length > TITLE_MAX) {
      throw ApiError.validation('Title must be between 1 and 500 characters.');
    }
    updates.title = title;
  }

  if (record.status !== undefined) {
    if (!isTodoStatus(record.status)) {
      throw ApiError.validation('Status must be one of: pending, in_progress, completed.');
    }
    updates.status = record.status;
  }

  if (record.stepsGenerated !== undefined) {
    if (typeof record.stepsGenerated !== 'boolean') {
      throw ApiError.validation('stepsGenerated must be a boolean.');
    }
    updates.stepsGenerated = record.stepsGenerated;
  }

  return updates;
}

export function validateUpdateStep(body: unknown): { isCompleted: boolean } {
  const record = asRecord(body);
  if (typeof record.isCompleted !== 'boolean') {
    throw ApiError.validation('isCompleted is required and must be a boolean.');
  }
  return { isCompleted: record.isCompleted };
}

export function validateGeneratedStep(item: unknown, index: number): { title: string; description: string } {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw ApiError.aiService(`AI step ${index + 1} is not an object.`);
  }
  const record = item as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  if (title.length < 1) {
    throw ApiError.aiService(`AI step ${index + 1} is missing a non-empty title.`);
  }
  if (description.length < 1) {
    throw ApiError.aiService(`AI step ${index + 1} is missing a non-empty description.`);
  }
  return {
    title: title.slice(0, STEP_TITLE_MAX),
    description: description.slice(0, STEP_DESC_MAX),
  };
}
