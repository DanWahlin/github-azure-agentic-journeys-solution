import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createApp } from '../src/app.ts';
import { createSqliteStore } from '../src/data/sqlite.ts';
import type { DataStore } from '../src/data/interfaces.ts';

let server: Server;
let store: DataStore;
let base: string;

before(async () => {
  store = createSqliteStore(':memory:');
  const app = createApp(store);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close?.();
});

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json: json as any };
}

test('GET /api/health returns ok', async () => {
  const r = await req('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

test('GET /api/products returns all 10 seed products as summaries', async () => {
  const r = await req('GET', '/products?pageSize=100');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.length, 10);
  assert.equal(r.json.totalCount, 10);
  assert.equal(r.json.data[0].description, undefined);
  assert.equal(r.json.data[0].sellerId, undefined);
});

test('GET /api/products?category=Electronics returns exactly 3', async () => {
  const r = await req('GET', '/products?category=Electronics&pageSize=100');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.length, 3);
  assert.ok(r.json.data.every((p: any) => p.category === 'Electronics'));
});

test('price min/max filters work', async () => {
  const r = await req('GET', '/products?minPrice=100&maxPrice=300&pageSize=100');
  assert.equal(r.status, 200);
  assert.ok(r.json.data.every((p: any) => p.price >= 100 && p.price <= 300));
});

test('GET /api/products/:id returns full detail', async () => {
  const r = await req('GET', '/products/prod-1');
  assert.equal(r.status, 200);
  assert.ok(r.json.description.length > 50);
  assert.equal(r.json.sellerId, 'user-seller-1');
});

test('GET /api/products/nonexistent returns 404 envelope', async () => {
  const r = await req('GET', '/products/nope');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'NOT_FOUND');
});

test('POST /api/products validates and creates', async () => {
  const bad = await req('POST', '/products', { name: 'x' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'VALIDATION_ERROR');

  const created = await req('POST', '/products', {
    name: 'Mechanical Keyboard',
    description: 'Cherry MX Brown switches with RGB backlighting and USB-C connection.',
    shortDescription: 'Mechanical keyboard with Cherry MX switches',
    price: 149.99,
    category: 'Electronics',
    tags: ['keyboard', 'mechanical'],
    inventory: 50,
    sellerId: 'user-seller-1',
  });
  assert.equal(created.status, 201);
  assert.ok(created.json.id);
  assert.equal(created.json.status, 'active');
  assert.equal(created.json.price, 149.99);
});

test('POST /api/products rejects unknown seller', async () => {
  const r = await req('POST', '/products', {
    name: 'Ghost',
    description: 'A product from a non-seller reference for testing purposes.',
    shortDescription: 'Ghost product',
    price: 10,
    category: 'Toys',
    inventory: 1,
    sellerId: 'user-buyer-1',
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});

test('POST /api/orders captures price server-side, computes total, decrements inventory', async () => {
  const before = await req('GET', '/products/prod-8');
  const beforeInv = before.json.inventory;
  const price = before.json.price;

  const order = await req('POST', '/orders', {
    userId: 'user-buyer-1',
    items: [{ productId: 'prod-8', quantity: 3, priceAtPurchase: 0.01 }],
    shippingAddress: {
      street: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      zip: '98101',
      country: 'US',
    },
  });
  assert.equal(order.status, 201);
  assert.equal(order.json.status, 'pending');
  // priceAtPurchase must come from the product, not the request body.
  assert.equal(order.json.items[0].priceAtPurchase, price);
  assert.equal(order.json.total, Math.round(price * 3 * 100) / 100);

  const after = await req('GET', '/products/prod-8');
  assert.equal(after.json.inventory, beforeInv - 3);
});

test('POST /api/orders rejects insufficient inventory', async () => {
  const r = await req('POST', '/orders', {
    userId: 'user-buyer-1',
    items: [{ productId: 'prod-1', quantity: 999999 }],
    shippingAddress: {
      street: 'a',
      city: 'b',
      state: 'c',
      zip: 'd',
      country: 'e',
    },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INSUFFICIENT_INVENTORY');
});

test('POST /api/orders rejects unknown product', async () => {
  const r = await req('POST', '/orders', {
    userId: 'user-buyer-1',
    items: [{ productId: 'does-not-exist', quantity: 1 }],
    shippingAddress: { street: 'a', city: 'b', state: 'c', zip: 'd', country: 'e' },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});

test('GET /api/orders/:id and ?userId list', async () => {
  const one = await req('GET', '/orders/order-1');
  assert.equal(one.status, 200);
  assert.equal(one.json.total, 1391.97);
  assert.equal(one.json.items.length, 2);

  const list = await req('GET', '/orders?userId=user-buyer-1');
  assert.equal(list.status, 200);
  assert.ok(list.json.totalCount >= 2);
});

test('PUT /api/products/:id price validation (64.99 ok, 64.991 rejected)', async () => {
  const good = await req('PUT', '/products/prod-3', { price: 64.99 });
  assert.equal(good.status, 200);
  assert.equal(good.json.price, 64.99);

  const bad = await req('PUT', '/products/prod-3', { price: 64.991 });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'VALIDATION_ERROR');
});

test('PUT /api/products/:id 404 for unknown', async () => {
  const r = await req('PUT', '/products/nope', { price: 10 });
  assert.equal(r.status, 404);
});

test('user register + duplicate email', async () => {
  const create = await req('POST', '/users/register', {
    email: 'newbie@example.com',
    name: 'New Bie',
    role: 'buyer',
  });
  assert.equal(create.status, 201);
  assert.ok(create.json.id);

  const dup = await req('POST', '/users/register', {
    email: 'newbie@example.com',
    name: 'Dup',
    role: 'buyer',
  });
  assert.equal(dup.status, 400);
  assert.equal(dup.json.error.code, 'DUPLICATE_EMAIL');
});

test('POST /api/products/search finds by keyword', async () => {
  const r = await req('POST', '/products/search', { query: 'headphones' });
  assert.equal(r.status, 200);
  assert.ok(r.json.data.some((p: any) => p.id === 'prod-2'));
});

test('POST /api/chat returns 503 when AI is not configured', async () => {
  const r = await req('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.status, 503);
});
