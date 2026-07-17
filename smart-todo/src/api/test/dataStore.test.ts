import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataStore } from '../src/data/memoryDataStore.ts';
import { ApiError } from '../src/models/errors.ts';

async function freshStore(seed = false) {
  const store = new MemoryDataStore({ seed });
  await store.initialize();
  return store;
}

test('seed loads exact todos and steps', async () => {
  const store = await freshStore(true);
  const todos = await store.todos.getAll('user-1');
  assert.equal(todos.length, 3);
  assert.deepEqual(todos.map((t) => t.id), ['todo-1', 'todo-2', 'todo-3']);

  const todo1 = await store.todos.getById('todo-1');
  assert.equal(todo1?.status, 'pending');
  assert.equal(todo1?.stepsGenerated, false);
  assert.equal(todo1?.steps.length, 0);

  const todo2 = await store.todos.getById('todo-2');
  assert.equal(todo2?.steps.length, 4);
  assert.deepEqual(todo2?.steps.map((s) => s.order), [1, 2, 3, 4]);
  assert.equal(todo2?.steps[0].isCompleted, true);
});

test('create sets pending status and empty steps', async () => {
  const store = await freshStore();
  const todo = await store.todos.create({ title: 'New goal', userId: 'user-1' });
  assert.equal(todo.status, 'pending');
  assert.equal(todo.stepsGenerated, false);
  assert.deepEqual(todo.steps, []);
  assert.match(todo.id, /^[0-9a-f-]{36}$/);
});

test('update mutates title, status, and stepsGenerated', async () => {
  const store = await freshStore();
  const todo = await store.todos.create({ title: 'x', userId: 'user-1' });
  const updated = await store.todos.update(todo.id, { title: 'y', status: 'in_progress', stepsGenerated: true });
  assert.equal(updated.title, 'y');
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.stepsGenerated, true);
});

test('update on missing todo throws NOT_FOUND', async () => {
  const store = await freshStore();
  await assert.rejects(() => store.todos.update('nope', { title: 'z' }), (e) => e instanceof ApiError && e.code === 'NOT_FOUND');
});

test('delete cascades to action steps', async () => {
  const store = await freshStore(true);
  await store.todos.delete('todo-2');
  assert.equal(await store.todos.getById('todo-2'), null);
  const steps = await store.actionSteps.getByTodoId('todo-2');
  assert.equal(steps.length, 0);
});

test('delete on missing todo throws NOT_FOUND', async () => {
  const store = await freshStore();
  await assert.rejects(() => store.todos.delete('missing'), ApiError);
});

test('action step create defaults isCompleted false and preserves order', async () => {
  const store = await freshStore();
  const todo = await store.todos.create({ title: 'goal', userId: 'user-1' });
  await store.actionSteps.create({ id: 's2', todoId: todo.id, title: 'B', description: 'b', order: 2 });
  await store.actionSteps.create({ id: 's1', todoId: todo.id, title: 'A', description: 'a', order: 1 });
  const steps = await store.actionSteps.getByTodoId(todo.id);
  assert.deepEqual(steps.map((s) => s.id), ['s1', 's2']);
  assert.equal(steps[0].isCompleted, false);
});
