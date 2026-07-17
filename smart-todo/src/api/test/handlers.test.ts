import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_STORE = 'memory';

type Params = Record<string, string>;

function mockRequest(opts: { params?: Params; query?: Params; body?: unknown } = {}): any {
  const query = new Map(Object.entries(opts.query ?? {}));
  return {
    params: opts.params ?? {},
    query: { get: (k: string) => query.get(k) ?? null },
    text: async () => (opts.body === undefined ? '' : JSON.stringify(opts.body)),
  };
}

const ctx: any = { log: () => {} };

// Imported dynamically after DATA_STORE is set.
let getTodos: any, createTodo: any, updateTodo: any, deleteTodo: any, updateStep: any;
let generateStepsHandler: any, setCompleterFactory: any;

before(async () => {
  ({ getTodos } = await import('../src/functions/getTodos.ts'));
  ({ createTodo } = await import('../src/functions/createTodo.ts'));
  ({ updateTodo } = await import('../src/functions/updateTodo.ts'));
  ({ deleteTodo } = await import('../src/functions/deleteTodo.ts'));
  ({ updateStep } = await import('../src/functions/updateStep.ts'));
  ({ generateStepsHandler, setCompleterFactory } = await import('../src/functions/generateSteps.ts'));

  setCompleterFactory(() => async () =>
    JSON.stringify([
      { title: 'Outline the talk', description: 'Draft a one-page outline of the main sections.' },
      { title: 'Build slides', description: 'Create 10-15 slides covering the outline.' },
      { title: 'Rehearse', description: 'Practice the talk out loud twice, timing each run.' },
    ]),
  );
});

test('getTodos returns seed data for user-1', async () => {
  const res = await getTodos(mockRequest({ query: { userId: 'user-1' } }), ctx);
  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.length, 3);
});

test('getTodos without userId returns 400', async () => {
  const res = await getTodos(mockRequest({}), ctx);
  assert.equal(res.status, 400);
  assert.equal(res.jsonBody.error.code, 'VALIDATION_ERROR');
});

test('createTodo returns 201 with pending status', async () => {
  const res = await createTodo(mockRequest({ body: { title: 'Write blog post', userId: 'user-1' } }), ctx);
  assert.equal(res.status, 201);
  assert.equal(res.jsonBody.status, 'pending');
  assert.equal(res.jsonBody.stepsGenerated, false);
});

test('createTodo with empty title returns 400', async () => {
  const res = await createTodo(mockRequest({ body: { title: '', userId: 'user-1' } }), ctx);
  assert.equal(res.status, 400);
});

test('updateTodo on missing id returns 404', async () => {
  const res = await updateTodo(mockRequest({ params: { id: 'nope' }, body: { status: 'in_progress' } }), ctx);
  assert.equal(res.status, 404);
});

test('updateTodo rejects invalid status with 400', async () => {
  const res = await updateTodo(mockRequest({ params: { id: 'todo-1' }, body: { status: 'not_started' } }), ctx);
  assert.equal(res.status, 400);
});

test('generateSteps produces steps and sets stepsGenerated', async () => {
  const res = await generateStepsHandler(mockRequest({ params: { id: 'todo-1' } }), ctx);
  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.stepsGenerated, true);
  assert.equal(res.jsonBody.steps.length, 3);
  assert.deepEqual(res.jsonBody.steps.map((s: any) => s.order), [1, 2, 3]);
});

test('generateSteps on missing todo returns 404', async () => {
  const res = await generateStepsHandler(mockRequest({ params: { id: 'ghost' } }), ctx);
  assert.equal(res.status, 404);
});

test('updateStep auto-completes todo when all steps done', async () => {
  // todo-2 seed: step-2-1/2 done, step-2-3/4 not done.
  let res = await updateStep(mockRequest({ params: { id: 'todo-2', stepId: 'step-2-3' }, body: { isCompleted: true } }), ctx);
  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.isCompleted, true);

  res = await updateStep(mockRequest({ params: { id: 'todo-2', stepId: 'step-2-4' }, body: { isCompleted: true } }), ctx);
  assert.equal(res.status, 200);

  const todos = await getTodos(mockRequest({ query: { userId: 'user-1' } }), ctx);
  const todo2 = todos.jsonBody.find((t: any) => t.id === 'todo-2');
  assert.equal(todo2.status, 'completed');
});

test('updateStep reverts completed todo to in_progress when a step is unchecked', async () => {
  const res = await updateStep(mockRequest({ params: { id: 'todo-2', stepId: 'step-2-4' }, body: { isCompleted: false } }), ctx);
  assert.equal(res.status, 200);

  const todos = await getTodos(mockRequest({ query: { userId: 'user-1' } }), ctx);
  const todo2 = todos.jsonBody.find((t: any) => t.id === 'todo-2');
  assert.equal(todo2.status, 'in_progress');
});

test('updateStep on missing step returns 404', async () => {
  const res = await updateStep(mockRequest({ params: { id: 'todo-2', stepId: 'no-step' }, body: { isCompleted: true } }), ctx);
  assert.equal(res.status, 404);
});

test('updateStep rejects non-boolean isCompleted with 400', async () => {
  const res = await updateStep(mockRequest({ params: { id: 'todo-2', stepId: 'step-2-1' }, body: { isCompleted: 'yes' } }), ctx);
  assert.equal(res.status, 400);
});

test('deleteTodo returns 204 and cascade removes steps', async () => {
  const res = await deleteTodo(mockRequest({ params: { id: 'todo-3' } }), ctx);
  assert.equal(res.status, 204);
  assert.equal(res.jsonBody, undefined);

  const after = await getTodos(mockRequest({ query: { userId: 'user-1' } }), ctx);
  assert.equal(after.jsonBody.find((t: any) => t.id === 'todo-3'), undefined);
});

test('deleteTodo on missing id returns 404', async () => {
  const res = await deleteTodo(mockRequest({ params: { id: 'todo-3' } }), ctx);
  assert.equal(res.status, 404);
});
