#!/usr/bin/env node
// AIMarket API verifier — exercises real HTTP behavior and exits non-zero on
// any failure. Cross-platform (PowerShell, cmd, Bash, CI): plain Node.js fetch.
//
// Base URL resolution order:
//   1. API_URL env var (with or without a trailing /api)
//   2. api/.runtime-port file written by the server (local dev)
//   3. http://localhost:3000
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveBase() {
  const fromEnv = process.env.API_URL;
  if (fromEnv && fromEnv.trim() !== '') return normalize(fromEnv.trim());
  try {
    const port = readFileSync(join(__dirname, '..', '.runtime-port'), 'utf8').trim();
    if (port) return `http://localhost:${port}/api`;
  } catch {
    /* fall through */
  }
  return 'http://localhost:3000/api';
}

// Ensure the base ends with exactly one /api segment.
function normalize(url) {
  let u = url.replace(/\/+$/, '');
  if (!/\/api$/.test(u)) u += '/api';
  return u;
}

const BASE = resolveBase();

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  \u2713 ${name}`);
}

function fail(name, detail) {
  failed += 1;
  failures.push({ name, detail });
  console.error(`  \u2717 ${name}\n      ${detail}`);
}

function assert(cond, name, detail) {
  if (cond) ok(name);
  else fail(name, detail);
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`Verifying AIMarket API at ${BASE}\n`);

  // 1. Health
  {
    const r = await req('GET', '/health');
    assert(
      r.status === 200 && r.json && r.json.status === 'ok',
      'GET /api/health returns 200 and {status:"ok"}',
      `status=${r.status} body=${JSON.stringify(r.json)}`,
    );
  }

  // 2. All 10 seed products
  {
    const r = await req('GET', '/products?pageSize=100');
    const count = r.json && Array.isArray(r.json.data) ? r.json.data.length : -1;
    assert(
      r.status === 200 && count === 10 && r.json.totalCount === 10,
      'GET /api/products returns all 10 seed products',
      `status=${r.status} dataLength=${count} totalCount=${r.json && r.json.totalCount}`,
    );
    // Summary shape: must NOT include description/sellerId.
    const sample = r.json && r.json.data && r.json.data[0];
    assert(
      sample && sample.description === undefined && sample.sellerId === undefined,
      'List response returns the summary shape (no description/sellerId)',
      `sample=${JSON.stringify(sample)}`,
    );
  }

  // 3. Category filter
  {
    const r = await req('GET', '/products?category=Electronics&pageSize=100');
    const data = (r.json && r.json.data) || [];
    const allElectronics = data.every((p) => p.category === 'Electronics');
    assert(
      r.status === 200 && data.length === 3 && allElectronics,
      'GET /api/products?category=Electronics returns exactly the 3 electronics products',
      `status=${r.status} length=${data.length} categories=${data.map((p) => p.category).join(',')}`,
    );
  }

  // 4. Full product detail
  {
    const r = await req('GET', '/products/prod-1');
    assert(
      r.status === 200 &&
        r.json &&
        typeof r.json.description === 'string' &&
        r.json.description.length > 50 &&
        r.json.sellerId === 'user-seller-1',
      'GET /api/products/prod-1 includes the full description and sellerId',
      `status=${r.status} body=${JSON.stringify(r.json)}`,
    );
  }

  // 5. 404 envelope
  {
    const r = await req('GET', '/products/nonexistent');
    assert(
      r.status === 404 &&
        r.json &&
        r.json.error &&
        r.json.error.code === 'NOT_FOUND',
      'GET /api/products/nonexistent returns the 404 NOT_FOUND envelope',
      `status=${r.status} body=${JSON.stringify(r.json)}`,
    );
  }

  // 6. Ordering decrements inventory by the requested quantity
  {
    const before = await req('GET', '/products/prod-8');
    const beforeInv = before.json && before.json.inventory;
    const qty = 2;
    const order = await req('POST', '/orders', {
      userId: 'user-buyer-1',
      items: [{ productId: 'prod-8', quantity: qty }],
      shippingAddress: {
        street: '123 Main St',
        city: 'Seattle',
        state: 'WA',
        zip: '98101',
        country: 'US',
      },
    });
    const orderOk =
      order.status === 201 &&
      order.json &&
      order.json.status === 'pending' &&
      Array.isArray(order.json.items) &&
      order.json.items[0].priceAtPurchase === (before.json && before.json.price) &&
      order.json.total === (before.json && before.json.price) * qty;
    assert(
      orderOk,
      'POST /api/orders creates a pending order with server-side priceAtPurchase and total',
      `status=${order.status} body=${JSON.stringify(order.json)}`,
    );

    const after = await req('GET', '/products/prod-8');
    const afterInv = after.json && after.json.inventory;
    assert(
      typeof beforeInv === 'number' && afterInv === beforeInv - qty,
      'Placing the order decrements inventory by the requested quantity',
      `before=${beforeInv} after=${afterInv} expected=${beforeInv - qty}`,
    );
  }

  // 7. Insufficient inventory is rejected
  {
    const r = await req('POST', '/orders', {
      userId: 'user-buyer-1',
      items: [{ productId: 'prod-9', quantity: 100000 }],
      shippingAddress: {
        street: '1 St',
        city: 'C',
        state: 'S',
        zip: '00000',
        country: 'US',
      },
    });
    assert(
      r.status === 400 && r.json && r.json.error && r.json.error.code === 'INSUFFICIENT_INVENTORY',
      'POST /api/orders rejects insufficient inventory with INSUFFICIENT_INVENTORY',
      `status=${r.status} body=${JSON.stringify(r.json)}`,
    );
  }

  // 8. Price validation: 64.99 accepted, 64.991 rejected
  {
    const good = await req('PUT', '/products/prod-3', { price: 64.99 });
    assert(
      good.status === 200 && good.json && good.json.price === 64.99,
      'PUT /api/products/prod-3 accepts a two-decimal price (64.99)',
      `status=${good.status} body=${JSON.stringify(good.json)}`,
    );

    const bad = await req('PUT', '/products/prod-3', { price: 64.991 });
    assert(
      bad.status === 400 && bad.json && bad.json.error && bad.json.error.code === 'VALIDATION_ERROR',
      'PUT /api/products/prod-3 rejects a three-decimal price (64.991)',
      `status=${bad.status} body=${JSON.stringify(bad.json)}`,
    );
  }

  // 9. User registration + duplicate email
  {
    const email = `verify-${Date.now()}@example.com`;
    const create = await req('POST', '/users/register', {
      email,
      name: 'Verify User',
      role: 'buyer',
    });
    assert(
      create.status === 201 && create.json && create.json.id && create.json.email === email,
      'POST /api/users/register creates a new user',
      `status=${create.status} body=${JSON.stringify(create.json)}`,
    );

    const dup = await req('POST', '/users/register', { email, name: 'Dup', role: 'buyer' });
    assert(
      dup.status === 400 && dup.json && dup.json.error && dup.json.error.code === 'DUPLICATE_EMAIL',
      'POST /api/users/register rejects a duplicate email',
      `status=${dup.status} body=${JSON.stringify(dup.json)}`,
    );
  }

  // 10. Every product image URL must return HTTP 2xx (broken images fail).
  {
    const r = await req('GET', '/products?pageSize=100');
    const data = (r.json && r.json.data) || [];
    const broken = [];
    for (const p of data) {
      if (!p.imageUrl) {
        broken.push(`${p.id}: empty imageUrl`);
        continue;
      }
      try {
        const imgRes = await fetch(p.imageUrl, { method: 'GET' });
        if (!imgRes.ok) broken.push(`${p.id}: HTTP ${imgRes.status} for ${p.imageUrl}`);
      } catch (e) {
        broken.push(`${p.id}: fetch error ${e.message}`);
      }
    }
    assert(
      broken.length === 0,
      'All product image URLs return HTTP 2xx',
      broken.join('; '),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
