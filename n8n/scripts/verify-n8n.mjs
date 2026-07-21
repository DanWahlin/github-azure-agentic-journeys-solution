#!/usr/bin/env node
// Portable n8n deployment verifier.
// Reads deployment values through azd, inspects the live Container App and its
// active revision through Azure CLI argument arrays, polls /healthz for HTTP 200,
// requires the UI to return HTTP 200, and uses Playwright's bundled Chromium to
// assert the rendered page is the owner-setup or login screen. Exits nonzero on
// any failure. No shell string interpolation is used.
import { chromium } from 'playwright';
import { run } from '../../.github/scripts/_utils.mjs';

function azd(key) {
  try {
    return run('azd', ['env', 'get-value', key]).stdout.trim();
  } catch {
    return '';
  }
}

function az(args) {
  return run('az', args).stdout.trim();
}

async function httpStatus(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    return res.status;
  } catch {
    return 0;
  }
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const appName = azd('N8N_CONTAINER_APP_NAME');
const resourceGroup = azd('RESOURCE_GROUP_NAME');
const url = azd('N8N_URL');

if (!appName || !resourceGroup || !url) {
  console.error('Missing required azd outputs (N8N_CONTAINER_APP_NAME, RESOURCE_GROUP_NAME, N8N_URL).');
  process.exit(1);
}
console.log(`n8n URL: ${url}`);
console.log(`Container App: ${appName}  RG: ${resourceGroup}`);

// 1. Live Container App running status
try {
  const provisioning = az([
    'containerapp', 'show', '--name', appName, '--resource-group', resourceGroup,
    '--query', 'properties.provisioningState', '--output', 'tsv',
  ]);
  record('Container App provisioning state', provisioning === 'Succeeded', provisioning);

  const running = az([
    'containerapp', 'revision', 'list', '--name', appName, '--resource-group', resourceGroup,
    '--query', "[?properties.active].properties.runningState | [0]", '--output', 'tsv',
  ]);
  record('Active revision running state', /running|processing/i.test(running), running || '(none)');
} catch (err) {
  record('Container App status query', false, err.message);
}

// 2. WEBHOOK_URL configured
try {
  const webhook = az([
    'containerapp', 'show', '--name', appName, '--resource-group', resourceGroup,
    '--query', "properties.template.containers[0].env[?name=='WEBHOOK_URL'].value | [0]",
    '--output', 'tsv',
  ]);
  record('WEBHOOK_URL configured', webhook === url, webhook || '(unset)');
} catch (err) {
  record('WEBHOOK_URL query', false, err.message);
}

// 3. Poll /healthz for up to 5 minutes
let healthOk = false;
const deadline = Date.now() + 5 * 60 * 1000;
let lastCode = 0;
while (Date.now() < deadline) {
  lastCode = await httpStatus(`${url}/healthz`);
  if (lastCode === 200) { healthOk = true; break; }
  await new Promise((r) => setTimeout(r, 10000));
}
record('/healthz returns HTTP 200', healthOk, `last=${lastCode}`);

// 4. UI root HTTP 200
const uiCode = await httpStatus(`${url}/`);
record('UI root returns HTTP 200', uiCode === 200, `status=${uiCode}`);

// 5. Browser render assertion with bundled Chromium
let title = '';
let rendered = '';
const resourceFailures = [];
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('requestfailed', (req) => {
    resourceFailures.push(`${req.resourceType()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`);
  });
  await page.goto(`${url}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  title = await page.title();
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const html = await page.content();
  const hay = `${body}\n${html}`.toLowerCase();
  const isOwnerSetup = /set up owner account|get started|create.*owner|owner account/.test(hay);
  const isLogin = /sign in|email.*password|n8n\.io|log in/.test(hay);
  rendered = isOwnerSetup ? 'owner-setup' : isLogin ? 'login' : 'unknown';
  record('Page title contains n8n', /n8n/i.test(title), `title="${title}"`);
  record('Owner-setup or login page renders', isOwnerSetup || isLogin, rendered);
  await browser.close();
} catch (err) {
  record('Browser render', false, err.message);
}

if (resourceFailures.length) {
  console.log('\nBrowser resource failures:');
  for (const f of resourceFailures) console.log(`  - ${f}`);
} else {
  console.log('\nNo browser resource failures.');
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
