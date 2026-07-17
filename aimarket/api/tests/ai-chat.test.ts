import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AzureFoundryChatClient,
  buildSystemPrompt,
  isGpt5Family,
  type OpenAiClientLike,
  type ChatMessage,
} from '../src/ai/chat.ts';

/** Fake openai client that records the params it was called with. */
function fakeOpenAi(content: string | null) {
  const calls: Record<string, unknown>[] = [];
  const client: OpenAiClientLike = {
    chat: {
      completions: {
        async create(params) {
          calls.push(params);
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  return { client, calls };
}

test('isGpt5Family detects gpt-5 deployments', () => {
  assert.equal(isGpt5Family('gpt-5-mini'), true);
  assert.equal(isGpt5Family('gpt-5'), true);
  assert.equal(isGpt5Family('gpt-4.1'), false);
  assert.equal(isGpt5Family('gpt-4o'), false);
});

test('gpt-5 deployment uses max_completion_tokens and omits temperature', async () => {
  const { client, calls } = fakeOpenAi('Hello!');
  const chat = new AzureFoundryChatClient(client, 'gpt-5-mini');
  const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

  const reply = await chat.complete(messages, { maxTokens: 500, temperature: 0.7 });

  assert.equal(reply, 'Hello!');
  assert.equal(calls[0].model, 'gpt-5-mini');
  assert.deepEqual(calls[0].messages, messages);
  assert.equal(calls[0].max_completion_tokens, 500);
  assert.equal('max_tokens' in calls[0], false);
  assert.equal('temperature' in calls[0], false);
});

test('gpt-4.1 fallback uses max_tokens and passes temperature', async () => {
  const { client, calls } = fakeOpenAi('Hi there');
  const chat = new AzureFoundryChatClient(client, 'gpt-4.1');

  await chat.complete([{ role: 'user', content: 'hi' }], { maxTokens: 500, temperature: 0.7 });

  assert.equal(calls[0].max_tokens, 500);
  assert.equal(calls[0].temperature, 0.7);
  assert.equal('max_completion_tokens' in calls[0], false);
});

test('complete returns empty string when the model yields no content', async () => {
  const { client } = fakeOpenAi(null);
  const chat = new AzureFoundryChatClient(client, 'gpt-5-mini');
  const reply = await chat.complete([{ role: 'user', content: 'hi' }], { maxTokens: 500 });
  assert.equal(reply, '');
});

test('buildSystemPrompt injects the catalog JSON', () => {
  const prompt = buildSystemPrompt('[{"id":"prod-1"}]');
  assert.match(prompt, /AIMarket shopping assistant/);
  assert.match(prompt, /Current catalog:/);
  assert.match(prompt, /\[\{"id":"prod-1"\}\]/);
  assert.equal(prompt.includes('{products_json}'), false);
});
