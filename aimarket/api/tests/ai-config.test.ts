import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadSearchConfig, loadChatConfig, loadAiConfig } from '../src/ai/config.ts';

test('loadSearchConfig requires endpoint AND key; applies defaults', () => {
  assert.equal(loadSearchConfig({}), null);
  assert.equal(loadSearchConfig({ AZURE_SEARCH_ENDPOINT: 'https://s' }), null);
  assert.equal(loadSearchConfig({ AZURE_SEARCH_KEY: 'k' }), null);

  const cfg = loadSearchConfig({
    AZURE_SEARCH_ENDPOINT: 'https://s.search.windows.net',
    AZURE_SEARCH_KEY: 'secret',
  });
  assert.deepEqual(cfg, {
    endpoint: 'https://s.search.windows.net',
    key: 'secret',
    indexName: 'aimarket-products',
    semanticConfiguration: 'aimarket-semantic',
  });

  const custom = loadSearchConfig({
    AZURE_SEARCH_ENDPOINT: 'https://s',
    AZURE_SEARCH_KEY: 'k',
    AZURE_SEARCH_INDEX: 'custom-idx',
    AZURE_SEARCH_SEMANTIC_CONFIG: 'custom-sem',
  });
  assert.equal(custom?.indexName, 'custom-idx');
  assert.equal(custom?.semanticConfiguration, 'custom-sem');
});

test('loadChatConfig requires only an endpoint (key optional for managed identity)', () => {
  assert.equal(loadChatConfig({}), null);

  const keyless = loadChatConfig({ AZURE_OPENAI_ENDPOINT: 'https://f.openai.azure.com' });
  assert.equal(keyless?.endpoint, 'https://f.openai.azure.com');
  assert.equal(keyless?.key, '');
  assert.equal(keyless?.deployment, 'gpt-5-mini');

  const keyed = loadChatConfig({
    AZURE_OPENAI_ENDPOINT: 'https://f',
    AZURE_OPENAI_KEY: 'k',
    AZURE_OPENAI_DEPLOYMENT: 'gpt-4.1',
  });
  assert.equal(keyed?.key, 'k');
  assert.equal(keyed?.deployment, 'gpt-4.1');
});

test('loadAiConfig returns nulls when unconfigured (local fallback path)', () => {
  assert.deepEqual(loadAiConfig({}), { search: null, chat: null });
});
