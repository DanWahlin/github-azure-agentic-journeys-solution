import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEndpoint,
  stripFences,
  parseSteps,
  generateSteps,
  toStepInputs,
  type ChatCompleter,
} from '../src/ai/stepGenerator.ts';
import { ApiError } from '../src/models/errors.ts';

test('normalizeEndpoint appends /openai/v1/', () => {
  assert.equal(normalizeEndpoint('https://x.openai.azure.com'), 'https://x.openai.azure.com/openai/v1/');
  assert.equal(normalizeEndpoint('https://x.openai.azure.com/'), 'https://x.openai.azure.com/openai/v1/');
  assert.equal(normalizeEndpoint('https://x.openai.azure.com/openai/v1/'), 'https://x.openai.azure.com/openai/v1/');
  assert.equal(normalizeEndpoint('https://x.openai.azure.com/openai'), 'https://x.openai.azure.com/openai/v1/');
});

test('stripFences removes ```json wrappers', () => {
  assert.equal(stripFences('```json\n[1]\n```'), '[1]');
  assert.equal(stripFences('```\n[2]\n```'), '[2]');
  assert.equal(stripFences('[3]'), '[3]');
});

test('parseSteps validates array of title/description', () => {
  const steps = parseSteps('[{"title":"A","description":"do a"},{"title":"B","description":"do b"}]');
  assert.equal(steps.length, 2);
  assert.equal(steps[0].title, 'A');
});

test('parseSteps rejects non-array', () => {
  assert.throws(() => parseSteps('{"title":"A"}'), (e) => e instanceof ApiError && e.code === 'AI_SERVICE_ERROR');
});

test('parseSteps rejects item missing description', () => {
  assert.throws(() => parseSteps('[{"title":"A"}]'), (e) => e instanceof ApiError && e.code === 'AI_SERVICE_ERROR');
});

test('parseSteps rejects invalid JSON', () => {
  assert.throws(() => parseSteps('not json'), ApiError);
});

test('generateSteps retries once on invalid first response', async () => {
  let calls = 0;
  const completer: ChatCompleter = async () => {
    calls += 1;
    return calls === 1 ? 'garbage' : '[{"title":"A","description":"do a"}]';
  };
  const steps = await generateSteps('Prepare talk', completer);
  assert.equal(calls, 2);
  assert.equal(steps.length, 1);
});

test('generateSteps throws AI_SERVICE_ERROR after retry fails', async () => {
  const completer: ChatCompleter = async () => 'still garbage';
  await assert.rejects(() => generateSteps('x', completer), (e) => e instanceof ApiError && e.code === 'AI_SERVICE_ERROR');
});

test('toStepInputs assigns 1-based order and uuids', () => {
  const inputs = toStepInputs('todo-1', [
    { title: 'A', description: 'a' },
    { title: 'B', description: 'b' },
  ]);
  assert.deepEqual(inputs.map((i) => i.order), [1, 2]);
  assert.equal(inputs[0].todoId, 'todo-1');
  assert.match(inputs[0].id, /^[0-9a-f-]{36}$/);
});
