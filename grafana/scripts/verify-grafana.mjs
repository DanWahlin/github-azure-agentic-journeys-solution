#!/usr/bin/env node
// Portable Grafana deployment verification.
// Reads GRAFANA_URL / admin credentials via azd; never prints the password.
// Asserts: /api/health -> 200 + database:"ok"; root reachable (200 after redirect);
// authenticated /api/org -> 200 with an organization payload.
import { execFileSync } from 'node:child_process';

function azdEnv(key) {
  try {
    return execFileSync('azd', ['env', 'get-value', key], {
      encoding: 'utf8',
      cwd: new URL('..', import.meta.url).pathname,
    }).trim();
  } catch {
    return '';
  }
}

const base = (process.env.GRAFANA_URL || azdEnv('GRAFANA_URL')).replace(/\/+$/, '');
const user = process.env.GRAFANA_ADMIN_USER || azdEnv('GRAFANA_ADMIN_USER') || 'admin';
const pass = process.env.GRAFANA_ADMIN_PASSWORD || azdEnv('GRAFANA_ADMIN_PASSWORD');

if (!base) {
  console.error('FAIL: GRAFANA_URL not found (set env or azd env).');
  process.exit(1);
}
console.log(`Target: ${base}`);

let failures = 0;
const pass_ = (m) => console.log(`PASS: ${m}`);
const fail_ = (m) => { console.error(`FAIL: ${m}`); failures++; };

async function main() {
  // 1. Health endpoint
  try {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    if (res.status === 200) pass_(`/api/health returned HTTP 200`);
    else fail_(`/api/health returned HTTP ${res.status}`);
    if (body.database === 'ok') pass_(`/api/health database="ok" (version ${body.version})`);
    else fail_(`/api/health database="${body.database}" (expected "ok")`);
  } catch (e) {
    fail_(`/api/health request error: ${e.message}`);
  }

  // 2. Root reachable (Grafana redirects / -> /login, final 200)
  try {
    const res = await fetch(`${base}/`, { redirect: 'follow' });
    if (res.status === 200) pass_(`root reachable, HTTP 200 after redirect (${res.url.endsWith('/login') ? '/login' : res.url})`);
    else fail_(`root returned HTTP ${res.status}`);
  } catch (e) {
    fail_(`root request error: ${e.message}`);
  }

  // 3. Authenticated API access (credentials never printed)
  if (!pass) {
    fail_('admin password unavailable; cannot verify authenticated access');
  } else {
    try {
      const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
      const res = await fetch(`${base}/api/org`, { headers: { Authorization: auth } });
      if (res.status === 200) {
        const org = await res.json();
        pass_(`authenticated /api/org returned HTTP 200 (org: "${org.name}")`);
      } else {
        fail_(`authenticated /api/org returned HTTP ${res.status}`);
      }
    } catch (e) {
      fail_(`/api/org request error: ${e.message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll verification checks passed.');
}

main();
