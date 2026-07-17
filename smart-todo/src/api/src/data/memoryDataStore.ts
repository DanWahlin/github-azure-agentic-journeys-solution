import { randomUUID } from 'node:crypto';
import type { DataStore, TodoRepository, ActionStepRepository } from './repositories.js';
import type { Todo, CreateTodoInput, UpdateTodoInput } from '../models/todo.js';
import type { ActionStep, CreateActionStepInput, UpdateActionStepInput } from '../models/actionStep.js';
import { ApiError } from '../models/errors.js';
import { SEED_TODOS, SEED_STEPS } from './seedData.js';

/**
 * In-memory DataStore used as a repository test double. It mirrors the
 * observable behaviour of the Azure SQL implementation (cascade delete,
 * ordered steps, timestamps) without requiring a database. Not used in Azure.
 */
export class MemoryDataStore implements DataStore {
  private readonly todoRows = new Map<string, Omit<Todo, 'steps'>>();
  private readonly stepRows = new Map<string, ActionStep>();

  readonly todos: TodoRepository;
  readonly actionSteps: ActionStepRepository;

  constructor(private readonly options: { seed?: boolean } = {}) {
    this.todos = new MemoryTodoRepository(this.todoRows, this.stepRows);
    this.actionSteps = new MemoryActionStepRepository(this.stepRows);
  }

  async initialize(): Promise<void> {
    if (this.options.seed) {
      this.loadSeed();
    }
  }

  private loadSeed(): void {
    if (this.todoRows.size > 0) return;
    const now = new Date().toISOString();
    for (const t of SEED_TODOS) {
      this.todoRows.set(t.id, {
        id: t.id,
        title: t.title,
        status: t.status,
        userId: t.userId,
        stepsGenerated: t.stepsGenerated,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const s of SEED_STEPS) {
      this.stepRows.set(s.id, { ...s, createdAt: now });
    }
  }
}

function assembleTodo(
  row: Omit<Todo, 'steps'>,
  stepRows: Map<string, ActionStep>,
): Todo {
  const steps = [...stepRows.values()]
    .filter((s) => s.todoId === row.id)
    .sort((a, b) => a.order - b.order);
  return { ...row, steps };
}

class MemoryTodoRepository implements TodoRepository {
  constructor(
    private readonly todoRows: Map<string, Omit<Todo, 'steps'>>,
    private readonly stepRows: Map<string, ActionStep>,
  ) {}

  async getAll(userId: string): Promise<Todo[]> {
    return [...this.todoRows.values()]
      .filter((t) => t.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((t) => assembleTodo(t, this.stepRows));
  }

  async getById(id: string): Promise<Todo | null> {
    const row = this.todoRows.get(id);
    return row ? assembleTodo(row, this.stepRows) : null;
  }

  async create(input: CreateTodoInput): Promise<Todo> {
    const now = new Date().toISOString();
    const row: Omit<Todo, 'steps'> = {
      id: randomUUID(),
      title: input.title,
      status: 'pending',
      userId: input.userId,
      stepsGenerated: false,
      createdAt: now,
      updatedAt: now,
    };
    this.todoRows.set(row.id, row);
    return assembleTodo(row, this.stepRows);
  }

  async update(id: string, updates: UpdateTodoInput): Promise<Todo> {
    const row = this.todoRows.get(id);
    if (!row) throw ApiError.notFound(`Todo ${id} not found.`);
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.stepsGenerated !== undefined) row.stepsGenerated = updates.stepsGenerated;
    row.updatedAt = new Date().toISOString();
    return assembleTodo(row, this.stepRows);
  }

  async delete(id: string): Promise<void> {
    const existed = this.todoRows.delete(id);
    if (!existed) throw ApiError.notFound(`Todo ${id} not found.`);
    for (const [stepId, step] of this.stepRows) {
      if (step.todoId === id) this.stepRows.delete(stepId);
    }
  }
}

class MemoryActionStepRepository implements ActionStepRepository {
  constructor(private readonly stepRows: Map<string, ActionStep>) {}

  async getByTodoId(todoId: string): Promise<ActionStep[]> {
    return [...this.stepRows.values()]
      .filter((s) => s.todoId === todoId)
      .sort((a, b) => a.order - b.order);
  }

  async create(step: CreateActionStepInput): Promise<ActionStep> {
    const row: ActionStep = {
      ...step,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };
    this.stepRows.set(row.id, row);
    return row;
  }

  async update(id: string, updates: UpdateActionStepInput): Promise<ActionStep> {
    const row = this.stepRows.get(id);
    if (!row) throw ApiError.notFound(`Action step ${id} not found.`);
    if (updates.isCompleted !== undefined) row.isCompleted = updates.isCompleted;
    return row;
  }

  async deleteByTodoId(todoId: string): Promise<void> {
    for (const [stepId, step] of this.stepRows) {
      if (step.todoId === todoId) this.stepRows.delete(stepId);
    }
  }
}
