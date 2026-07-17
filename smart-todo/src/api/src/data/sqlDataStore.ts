import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import type { DataStore, TodoRepository, ActionStepRepository } from './repositories.js';
import type { Todo, CreateTodoInput, UpdateTodoInput } from '../models/todo.js';
import type { ActionStep, CreateActionStepInput, UpdateActionStepInput } from '../models/actionStep.js';
import type { TodoStatus } from '../models/todo.js';
import { ApiError } from '../models/errors.js';
import { SCHEMA_SQL } from './schema.js';

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value as string).toISOString();
}

interface TodoDbRow {
  id: string;
  title: string;
  status: string;
  userId: string;
  stepsGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StepDbRow {
  id: string;
  todoId: string;
  title: string;
  description: string;
  order: number;
  isCompleted: boolean;
  createdAt: Date;
}

function mapTodoRow(row: TodoDbRow, steps: ActionStep[]): Todo {
  return {
    id: row.id,
    title: row.title,
    status: row.status as TodoStatus,
    userId: row.userId,
    stepsGenerated: Boolean(row.stepsGenerated),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    steps,
  };
}

function mapStepRow(row: StepDbRow): ActionStep {
  return {
    id: row.id,
    todoId: row.todoId,
    title: row.title,
    description: row.description,
    order: row.order,
    isCompleted: Boolean(row.isCompleted),
    createdAt: toIso(row.createdAt),
  };
}

/**
 * Builds the mssql connection configuration. In Azure (and by default) it uses
 * Microsoft Entra managed identity via `azure-active-directory-default` — no
 * passwords. For local development, providing AZURE_SQL_USER/AZURE_SQL_PASSWORD
 * switches to SQL authentication. AZURE_SQL_SERVER must be the full FQDN in
 * Azure (for example, `sql-name.database.windows.net`) and must not be stripped.
 */
export function buildSqlConfig(env: NodeJS.ProcessEnv = process.env): sql.config {
  const server = env.AZURE_SQL_SERVER;
  const database = env.AZURE_SQL_DATABASE;
  if (!server || !database) {
    throw ApiError.internal('AZURE_SQL_SERVER and AZURE_SQL_DATABASE must be set.');
  }

  const user = env.AZURE_SQL_USER;
  const password = env.AZURE_SQL_PASSWORD;
  const useSqlAuth = Boolean(user && password);

  const base: sql.config = {
    server,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: server === 'localhost' || server === '127.0.0.1',
      connectTimeout: 60000,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };

  if (useSqlAuth) {
    return { ...base, user, password };
  }

  return {
    ...base,
    authentication: {
      type: 'azure-active-directory-default',
      options: {},
    },
  };
}

export class SqlDataStore implements DataStore {
  private pool: sql.ConnectionPool | null = null;
  private initialized = false;

  readonly todos: TodoRepository;
  readonly actionSteps: ActionStepRepository;

  constructor(private readonly config: sql.config = buildSqlConfig()) {
    this.todos = new SqlTodoRepository(() => this.getPool());
    this.actionSteps = new SqlActionStepRepository(() => this.getPool());
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      this.pool = await new sql.ConnectionPool(this.config).connect();
    }
    return this.pool;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const pool = await this.getPool();
    await pool.request().batch(SCHEMA_SQL);
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      this.initialized = false;
    }
  }
}

class SqlTodoRepository implements TodoRepository {
  constructor(private readonly pool: () => Promise<sql.ConnectionPool>) {}

  async getAll(userId: string): Promise<Todo[]> {
    const pool = await this.pool();
    const todoResult = await pool
      .request()
      .input('userId', sql.NVarChar(100), userId)
      .query<TodoDbRow>(
        'SELECT id, title, status, userId, stepsGenerated, createdAt, updatedAt FROM Todos WHERE userId = @userId ORDER BY createdAt ASC',
      );

    const todos = todoResult.recordset;
    if (todos.length === 0) return [];

    const stepResult = await pool
      .request()
      .input('userId', sql.NVarChar(100), userId)
      .query<StepDbRow>(
        'SELECT s.id, s.todoId, s.title, s.description, s.[order], s.isCompleted, s.createdAt ' +
          'FROM ActionSteps s INNER JOIN Todos t ON s.todoId = t.id WHERE t.userId = @userId ORDER BY s.[order] ASC',
      );

    const stepsByTodo = new Map<string, ActionStep[]>();
    for (const row of stepResult.recordset) {
      const list = stepsByTodo.get(row.todoId) ?? [];
      list.push(mapStepRow(row));
      stepsByTodo.set(row.todoId, list);
    }

    return todos.map((t) => mapTodoRow(t, stepsByTodo.get(t.id) ?? []));
  }

  async getById(id: string): Promise<Todo | null> {
    const pool = await this.pool();
    const todoResult = await pool
      .request()
      .input('id', sql.NVarChar(36), id)
      .query<TodoDbRow>(
        'SELECT id, title, status, userId, stepsGenerated, createdAt, updatedAt FROM Todos WHERE id = @id',
      );

    const row = todoResult.recordset[0];
    if (!row) return null;

    const stepResult = await pool
      .request()
      .input('todoId', sql.NVarChar(36), id)
      .query<StepDbRow>(
        'SELECT id, todoId, title, description, [order], isCompleted, createdAt FROM ActionSteps WHERE todoId = @todoId ORDER BY [order] ASC',
      );

    return mapTodoRow(row, stepResult.recordset.map(mapStepRow));
  }

  async create(input: CreateTodoInput): Promise<Todo> {
    const pool = await this.pool();
    const id = randomUUID();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(36), id)
      .input('title', sql.NVarChar(500), input.title)
      .input('userId', sql.NVarChar(100), input.userId)
      .query<TodoDbRow>(
        'INSERT INTO Todos (id, title, status, userId, stepsGenerated) ' +
          "OUTPUT INSERTED.id, INSERTED.title, INSERTED.status, INSERTED.userId, INSERTED.stepsGenerated, INSERTED.createdAt, INSERTED.updatedAt " +
          "VALUES (@id, @title, 'pending', @userId, 0)",
      );
    return mapTodoRow(result.recordset[0], []);
  }

  async update(id: string, updates: UpdateTodoInput): Promise<Todo> {
    const pool = await this.pool();
    const request = pool.request().input('id', sql.NVarChar(36), id);
    const sets: string[] = [];

    if (updates.title !== undefined) {
      request.input('title', sql.NVarChar(500), updates.title);
      sets.push('title = @title');
    }
    if (updates.status !== undefined) {
      request.input('status', sql.NVarChar(20), updates.status);
      sets.push('status = @status');
    }
    if (updates.stepsGenerated !== undefined) {
      request.input('stepsGenerated', sql.Bit, updates.stepsGenerated);
      sets.push('stepsGenerated = @stepsGenerated');
    }
    sets.push('updatedAt = GETUTCDATE()');

    const result = await request.query<TodoDbRow>(
      `UPDATE Todos SET ${sets.join(', ')} ` +
        'OUTPUT INSERTED.id, INSERTED.title, INSERTED.status, INSERTED.userId, INSERTED.stepsGenerated, INSERTED.createdAt, INSERTED.updatedAt ' +
        'WHERE id = @id',
    );

    const row = result.recordset[0];
    if (!row) throw ApiError.notFound(`Todo ${id} not found.`);

    const stepResult = await pool
      .request()
      .input('todoId', sql.NVarChar(36), id)
      .query<StepDbRow>(
        'SELECT id, todoId, title, description, [order], isCompleted, createdAt FROM ActionSteps WHERE todoId = @todoId ORDER BY [order] ASC',
      );

    return mapTodoRow(row, stepResult.recordset.map(mapStepRow));
  }

  async delete(id: string): Promise<void> {
    const pool = await this.pool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(36), id)
      .query('DELETE FROM Todos WHERE id = @id');
    if (result.rowsAffected[0] === 0) {
      throw ApiError.notFound(`Todo ${id} not found.`);
    }
  }
}

class SqlActionStepRepository implements ActionStepRepository {
  constructor(private readonly pool: () => Promise<sql.ConnectionPool>) {}

  async getByTodoId(todoId: string): Promise<ActionStep[]> {
    const pool = await this.pool();
    const result = await pool
      .request()
      .input('todoId', sql.NVarChar(36), todoId)
      .query<StepDbRow>(
        'SELECT id, todoId, title, description, [order], isCompleted, createdAt FROM ActionSteps WHERE todoId = @todoId ORDER BY [order] ASC',
      );
    return result.recordset.map(mapStepRow);
  }

  async create(step: CreateActionStepInput): Promise<ActionStep> {
    const pool = await this.pool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(36), step.id)
      .input('todoId', sql.NVarChar(36), step.todoId)
      .input('title', sql.NVarChar(200), step.title)
      .input('description', sql.NVarChar(1000), step.description)
      .input('order', sql.Int, step.order)
      .query<StepDbRow>(
        'INSERT INTO ActionSteps (id, todoId, title, description, [order], isCompleted) ' +
          'OUTPUT INSERTED.id, INSERTED.todoId, INSERTED.title, INSERTED.description, INSERTED.[order], INSERTED.isCompleted, INSERTED.createdAt ' +
          'VALUES (@id, @todoId, @title, @description, @order, 0)',
      );
    return mapStepRow(result.recordset[0]);
  }

  async update(id: string, updates: UpdateActionStepInput): Promise<ActionStep> {
    const pool = await this.pool();
    if (updates.isCompleted === undefined) {
      const existing = await pool
        .request()
        .input('id', sql.NVarChar(36), id)
        .query<StepDbRow>(
          'SELECT id, todoId, title, description, [order], isCompleted, createdAt FROM ActionSteps WHERE id = @id',
        );
      const row = existing.recordset[0];
      if (!row) throw ApiError.notFound(`Action step ${id} not found.`);
      return mapStepRow(row);
    }

    const result = await pool
      .request()
      .input('id', sql.NVarChar(36), id)
      .input('isCompleted', sql.Bit, updates.isCompleted)
      .query<StepDbRow>(
        'UPDATE ActionSteps SET isCompleted = @isCompleted ' +
          'OUTPUT INSERTED.id, INSERTED.todoId, INSERTED.title, INSERTED.description, INSERTED.[order], INSERTED.isCompleted, INSERTED.createdAt ' +
          'WHERE id = @id',
      );
    const row = result.recordset[0];
    if (!row) throw ApiError.notFound(`Action step ${id} not found.`);
    return mapStepRow(row);
  }

  async deleteByTodoId(todoId: string): Promise<void> {
    const pool = await this.pool();
    await pool
      .request()
      .input('todoId', sql.NVarChar(36), todoId)
      .query('DELETE FROM ActionSteps WHERE todoId = @todoId');
  }
}
