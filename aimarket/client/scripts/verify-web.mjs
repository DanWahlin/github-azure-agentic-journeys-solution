#!/usr/bin/env node
// AIMarket storefront verifier — cross-platform (PowerShell, cmd, Bash, CI).
//
// Verifies, against a *running* built storefront + API:
//   1. The web (preview) server serves the SPA shell (HTML + module script).
//   2. The API is reachable and returns all 10 seed products.
//   3. Every product image returns HTTP 2xx with an image/* content type.
//
// URL resolution:
//   WEB_URL   — base URL of the storefront preview server (default http://localhost:4173)
//   API_URL   — API base, with or without a trailing /api. If unset, falls back to
//               ../api/.runtime-port (written by the API server), else http://localhost:3000.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeApi(url) {
  let u = url.replace(/\/+$/, '');
  if (!/\/api$/.test(u)) u += '/api';
  return u;
}

function resolveApiBase() {
  const fromEnv = process.env.API_URL;
  if (fromEnv && fromEnv.trim() !== '') return normalizeApi(fromEnv.trim());
  try {
    const port = readFileSync(join(__dirname, '..', '..', 'api', '.runtime-port'), 'utf8').trim();
    if (port) return `http://localhost:${port}/api`;
  } catch {
    /* fall through */
  }
  return 'http://localhost:3000/api';
}

const WEB_URL = (process.env.WEB_URL || 'http://localhost:4173').replace(/\/+$/, '');
const API_BASE = resolveApiBase();

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, name, detail) {
  if (cond) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.error(`  \u2717 ${name}\n      ${detail}`);
  }
}

async function main() {
  console.log(`Verifying storefront at ${WEB_URL}`);
  console.log(`Against API at ${API_BASE}\n`);

  // 1. SPA shell is served.
  {
    let status = 0;
    let html = '';
    try {
      const res = await fetch(`${WEB_URL}/`);
      status = res.status;
      html = await res.text();
    } catch (e) {
      html = `fetch error: ${e.message}`;
    }
    assert(
      status === 200 && /<div id="root">/.test(html) && /<script[^>]+type="module"/.test(html),
      'Storefront serves the SPA shell (root div + module script)',
      `status=${status} htmlSnippet=${html.slice(0, 160)}`,
    );
    assert(/<title>AIMarket<\/title>/.test(html), 'Storefront HTML has the AIMarket title', `htmlSnippet=${html.slice(0, 160)}`);
  }

  // 2. API returns all 10 seed products (the storefront's data source).
  let products = [];
  {
    let status = 0;
    let body = null;
    try {
      const res = await fetch(`${API_BASE}/products?pageSize=100`);
      status = res.status;
      body = await res.json();
    } catch (e) {
      body = { error: e.message };
    }
    products = (body && body.data) || [];
    assert(
      status === 200 && products.length === 10 && body.totalCount === 10,
      'API returns all 10 seed products for the storefront',
      `status=${status} count=${products.length} totalCount=${body && body.totalCount}`,
    );
  }

  // 3. Every product image returns HTTP 2xx with an image/* content type.
  {
    const bad = [];
    for (const p of products) {
      if (!p.imageUrl) {
        bad.push(`${p.id}: empty imageUrl`);
        continue;
      }
      try {
        const res = await fetch(p.imageUrl);
        const ct = res.headers.get('content-type') || '';
        if (!res.ok) bad.push(`${p.id}: HTTP ${res.status}`);
        else if (!/^image\//i.test(ct)) bad.push(`${p.id}: content-type "${ct}"`);
      } catch (e) {
        bad.push(`${p.id}: fetch error ${e.message}`);
      }
    }
    assert(
      products.length === 10 && bad.length === 0,
      'All 10 product images return HTTP 2xx with an image/* content type',
      bad.join('; ') || 'no products to check',
    );
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('All storefront checks passed.');
}

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
