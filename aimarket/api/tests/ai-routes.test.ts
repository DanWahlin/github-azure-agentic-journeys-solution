import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createApp } from '../src/app.ts';
import { createSqliteStore } from '../src/data/sqlite.ts';
import type { DataStore } from '../src/data/interfaces.ts';
import type {
  ProductSearchProvider,
  SearchFilters,
  SearchHit,
  ProductIndexDocument,
} from '../src/ai/search.ts';
import type {
  ChatCompletionClient,
  ChatMessage,
  ChatCompletionOptions,
} from '../src/ai/chat.ts';

// --- Fakes -----------------------------------------------------------------

class FakeSearchProvider implements ProductSearchProvider {
  public lastQuery?: string;
  public lastFilters?: SearchFilters;
  public lastTop?: number;
  public indexed: ProductIndexDocument[] = [];

  constructor(private readonly hits: SearchHit[]) {}

  async search(query: string, filters: SearchFilters, top: number): Promise<SearchHit[]> {
    this.lastQuery = query;
    this.lastFilters = filters;
    this.lastTop = top;
    return this.hits;
  }

  async indexProducts(products: ProductIndexDocument[]): Promise<number> {
    this.indexed = products;
    return products.length;
  }
}

class FakeChatClient implements ChatCompletionClient {
  public lastMessages?: ChatMessage[];
  public lastOptions?: ChatCompletionOptions;

  constructor(
    private readonly reply: string,
    private readonly throwErr = false,
  ) {}

  async complete(messages: ChatMessage[], options: ChatCompletionOptions): Promise<string> {
    this.lastMessages = messages;
    this.lastOptions = options;
    if (this.throwErr) throw new Error('boom: secret-key-should-not-leak');
    return this.reply;
  }
}

// --- Harness ---------------------------------------------------------------

async function startServer(app: ReturnType<typeof createApp>) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}/api` };
}

async function req(base: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json: json as any };
}

let store: DataStore;

before(() => {
  store = createSqliteStore(':memory:');
});

after(() => {
  store.close?.();
});

// --- Search route ----------------------------------------------------------

test('POST /products/search with a provider returns {data,query,count} with scores (two-step hydration)', async () => {
  const provider = new FakeSearchProvider([
    { id: 'prod-1', score: 0.92 },
    { id: 'prod-2', score: 0.81 },
  ]);
  const app = createApp(store, { search: provider, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/search', {
      query: 'something lightweight for travel',
      category: 'Electronics',
      minPrice: 100,
      maxPrice: 1500,
    });

    assert.equal(r.status, 200);
    assert.equal(r.json.query, 'something lightweight for travel');
    assert.equal(r.json.count, 2);
    assert.equal(r.json.data.length, 2);

    // Provider received the query, flat filters, and top=10.
    assert.equal(provider.lastQuery, 'something lightweight for travel');
    assert.deepEqual(provider.lastFilters, {
      category: 'Electronics',
      minPrice: 100,
      maxPrice: 1500,
    });
    assert.equal(provider.lastTop, 10);

    // Results hydrate full DB details and carry the score.
    const first = r.json.data[0];
    assert.equal(first.id, 'prod-1');
    assert.equal(first.score, 0.92);
    assert.ok(typeof first.shortDescription === 'string' && first.shortDescription.length > 0);
    assert.ok(typeof first.imageUrl === 'string' && first.imageUrl.length > 0);
    // Summary shape: no description/sellerId.
    assert.equal(first.description, undefined);
    assert.equal(first.sellerId, undefined);
  } finally {
    server.close();
  }
});

test('POST /products/search drops hits that no longer exist in the DB', async () => {
  const provider = new FakeSearchProvider([
    { id: 'prod-1', score: 0.9 },
    { id: 'ghost-id', score: 0.5 },
  ]);
  const app = createApp(store, { search: provider, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/search', { query: 'laptop' });
    assert.equal(r.status, 200);
    assert.equal(r.json.count, 1);
    assert.equal(r.json.data[0].id, 'prod-1');
  } finally {
    server.close();
  }
});

test('POST /products/search falls back to LIKE (no provider) and still returns scores', async () => {
  const app = createApp(store, { search: null, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/search', { query: 'headphones' });
    assert.equal(r.status, 200);
    assert.equal(typeof r.json.query, 'string');
    assert.ok(r.json.data.some((p: any) => p.id === 'prod-2'));
    // Every result carries a 0..1 score.
    assert.ok(r.json.data.every((p: any) => p.score >= 0 && p.score <= 1));
    assert.ok(r.json.data.length <= 10);
  } finally {
    server.close();
  }
});

test('POST /products/search degrades to text search when the provider throws', async () => {
  const throwing: ProductSearchProvider = {
    async search() {
      throw new Error('Azure AI Search unavailable');
    },
    async indexProducts() {
      return 0;
    },
  };
  const app = createApp(store, { search: throwing, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/search', { query: 'headphones' });
    assert.equal(r.status, 200);
    // Fell back to LIKE search rather than 500.
    assert.ok(r.json.data.some((p: any) => p.id === 'prod-2'));
    assert.equal(r.json.query, 'headphones');
  } finally {
    server.close();
  }
});

test('POST /products/search requires a query', async () => {
  const app = createApp(store, { search: null, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/search', { query: '   ' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  } finally {
    server.close();
  }
});

// --- Reindex route ---------------------------------------------------------

test('POST /products/reindex returns 503 without a provider', async () => {
  const app = createApp(store, { search: null, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/reindex');
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'INTERNAL_ERROR');
  } finally {
    server.close();
  }
});

test('POST /products/reindex pushes all active products when configured', async () => {
  const provider = new FakeSearchProvider([]);
  const app = createApp(store, { search: provider, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/products/reindex');
    assert.equal(r.status, 200);
    assert.equal(r.json.indexed, 10);
    assert.equal(provider.indexed.length, 10);
    // Index docs carry the searchable fields.
    assert.ok(provider.indexed.every((d) => d.id && d.name && d.category));
  } finally {
    server.close();
  }
});

// --- Chat route ------------------------------------------------------------

test('POST /chat returns 503 without a chat client', async () => {
  const app = createApp(store, { search: null, chat: null });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/chat', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(r.status, 503);
    assert.match(r.json.error.message, /not configured/i);
  } finally {
    server.close();
  }
});

test('POST /chat injects the catalog system prompt, forwards history, returns {role,content}', async () => {
  const client = new FakeChatClient('We have the UltraBook Pro 15 at $1,299.99 (4.7 stars).');
  const app = createApp(store, { search: null, chat: client });
  const { server, base } = await startServer(app);
  try {
    const history = [
      { role: 'user', content: 'What laptops do you have?' },
      { role: 'assistant', content: 'Let me check.' },
      { role: 'user', content: 'Anything lightweight?' },
    ];
    const r = await req(base, 'POST', '/chat', { messages: history });

    assert.equal(r.status, 200);
    assert.equal(r.json.role, 'assistant');
    assert.match(r.json.content, /UltraBook Pro 15/);

    // First message is the system prompt with catalog JSON; history follows.
    const sent = client.lastMessages!;
    assert.equal(sent[0].role, 'system');
    assert.match(sent[0].content, /AIMarket shopping assistant/);
    assert.match(sent[0].content, /UltraBook Pro 15/); // catalog injected
    assert.deepEqual(sent.slice(1), history);
    assert.equal(client.lastOptions!.maxTokens, 500);
  } finally {
    server.close();
  }
});

test('POST /chat validates the message shape', async () => {
  const client = new FakeChatClient('ok');
  const app = createApp(store, { search: null, chat: client });
  const { server, base } = await startServer(app);
  try {
    assert.equal((await req(base, 'POST', '/chat', {})).status, 400);
    assert.equal((await req(base, 'POST', '/chat', { messages: [] })).status, 400);
    const badRole = await req(base, 'POST', '/chat', { messages: [{ role: 'x', content: 'hi' }] });
    assert.equal(badRole.status, 400);
    const badContent = await req(base, 'POST', '/chat', { messages: [{ role: 'user', content: '' }] });
    assert.equal(badContent.status, 400);
  } finally {
    server.close();
  }
});

test('POST /chat maps provider failures to a 502 without leaking details', async () => {
  const client = new FakeChatClient('unused', true);
  const app = createApp(store, { search: null, chat: client });
  const { server, base } = await startServer(app);
  try {
    const r = await req(base, 'POST', '/chat', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(r.status, 502);
    assert.equal(r.json.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(r.json), /secret-key/);
  } finally {
    server.close();
  }
});
