import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AzureAiSearchProvider,
  buildFilter,
  toIndexDocument,
  type SearchClientLike,
  type ProductIndexDocument,
} from '../src/ai/search.ts';
import type { Product } from '../src/models/product.ts';

/** Build a fake Azure SearchClient that records the query/options it received. */
function fakeSearchClient(
  hits: Array<{ id: string; score?: number; rerankerScore?: number }>,
) {
  const calls: { searchText: string; options: Record<string, unknown> }[] = [];
  const uploaded: ProductIndexDocument[][] = [];
  const client: SearchClientLike = {
    async search(searchText, options) {
      calls.push({ searchText, options });
      async function* gen() {
        for (const h of hits) {
          yield { document: { id: h.id }, score: h.score, rerankerScore: h.rerankerScore };
        }
      }
      return { results: gen() };
    },
    async mergeOrUploadDocuments(documents) {
      uploaded.push(documents);
      return { results: [] };
    },
  };
  return { client, calls, uploaded };
}

test('buildFilter composes OData clauses and escapes quotes', () => {
  assert.equal(buildFilter({}), undefined);
  assert.equal(buildFilter({ category: 'Electronics' }), "category eq 'Electronics'");
  assert.equal(
    buildFilter({ category: 'Home', minPrice: 100, maxPrice: 1500 }),
    "category eq 'Home' and price ge 100 and price le 1500",
  );
  assert.equal(buildFilter({ category: "O'Neil" }), "category eq 'O''Neil'");
});

test('AzureAiSearchProvider sends a semantic query with config, top, filter, select', async () => {
  const { client, calls } = fakeSearchClient([{ id: 'prod-1', rerankerScore: 4 }]);
  const provider = new AzureAiSearchProvider(client, 'aimarket-semantic');

  await provider.search('lightweight for travel', { category: 'Electronics' }, 10);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchText, 'lightweight for travel');
  assert.equal(calls[0].options.queryType, 'semantic');
  assert.deepEqual(calls[0].options.semanticSearchOptions, {
    configurationName: 'aimarket-semantic',
  });
  assert.equal(calls[0].options.top, 10);
  assert.equal(calls[0].options.filter, "category eq 'Electronics'");
  assert.deepEqual(calls[0].options.select, ['id']);
});

test('AzureAiSearchProvider normalizes reranker scores into 0..1 and returns ids', async () => {
  const { client } = fakeSearchClient([
    { id: 'prod-1', rerankerScore: 4 }, // -> 1
    { id: 'prod-2', rerankerScore: 2 }, // -> 0.5
    { id: 'prod-3', score: 3 }, // no reranker -> 3/(3+1) = 0.75
  ]);
  const provider = new AzureAiSearchProvider(client, 'aimarket-semantic');

  const hits = await provider.search('anything', {}, 10);
  assert.deepEqual(hits, [
    { id: 'prod-1', score: 1 },
    { id: 'prod-2', score: 0.5 },
    { id: 'prod-3', score: 0.75 },
  ]);
});

test('AzureAiSearchProvider.indexProducts merge-uploads documents', async () => {
  const { client, uploaded } = fakeSearchClient([]);
  const provider = new AzureAiSearchProvider(client, 'aimarket-semantic');

  const docs: ProductIndexDocument[] = [
    { id: 'p1', name: 'A', description: 'd', category: 'Books', tags: ['t'], price: 1, rating: 5 },
  ];
  const count = await provider.indexProducts(docs);
  assert.equal(count, 1);
  assert.equal(uploaded.length, 1);
  assert.deepEqual(uploaded[0], docs);

  // Empty input is a no-op (no upload call).
  const zero = await provider.indexProducts([]);
  assert.equal(zero, 0);
  assert.equal(uploaded.length, 1);
});

test('toIndexDocument maps a product to the index schema', () => {
  const product: Product = {
    id: 'prod-1',
    name: 'UltraBook Pro 15',
    description: 'A long description.',
    shortDescription: 'short',
    price: 1299.99,
    category: 'Electronics',
    tags: ['laptop', 'ultrabook'],
    inventory: 25,
    rating: 4.7,
    reviewCount: 142,
    imageUrl: 'https://example.com/x.jpg',
    sellerId: 'user-seller-1',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.deepEqual(toIndexDocument(product), {
    id: 'prod-1',
    name: 'UltraBook Pro 15',
    description: 'A long description.',
    category: 'Electronics',
    tags: ['laptop', 'ultrabook'],
    price: 1299.99,
    rating: 4.7,
  });
});
