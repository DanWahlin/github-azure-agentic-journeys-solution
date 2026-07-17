export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export const TODO_STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed'] as const;

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (TODO_STATUSES as readonly string[]).includes(value);
}

import type { ActionStep } from './actionStep.js';

export interface Todo {
  id: string;
  title: string;
  status: TodoStatus;
  userId: string;
  stepsGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  steps: ActionStep[];
}

export interface CreateTodoInput {
  title: string;
  userId: string;
}

export interface UpdateTodoInput {
  title?: string;
  status?: TodoStatus;
  stepsGenerated?: boolean;
}
