#!/usr/bin/env node
// Capture a screenshot of a public page using Playwright's bundled Chromium.
// Records failed document/script/xhr/fetch/image requests. Never prints credentials.
import { chromium } from 'playwright';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url = arg('url');
const output = arg('output', 'screenshot.png');
const failOnResourceErrors = arg('fail-on-resource-errors', 'false') === 'true';

if (!url) {
  console.error('FAIL: --url is required');
  process.exit(1);
}

const failed = [];
const watched = new Set(['document', 'script', 'xhr', 'fetch', 'image']);

const browser = await chromium.launch({ chromium_sandbox: false });
try {
  const page = await browser.newPage();
  page.on('requestfailed', (req) => {
    const type = req.resourceType();
    if (watched.has(type)) {
      failed.push({ type, url: req.url(), error: req.failure()?.errorText });
    }
  });
  page.on('response', (res) => {
    const type = res.request().resourceType();
    if (watched.has(type) && res.status() >= 400) {
      failed.push({ type, url: res.url(), status: res.status() });
    }
  });

  console.log(`Navigating to ${url}`);
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  console.log(`Landed on ${page.url()} (HTTP ${resp?.status()})`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: output, fullPage: true });
  console.log(`Screenshot saved: ${output}`);

  if (failed.length) {
    console.log(`\nFailed resource requests (${failed.length}):`);
    for (const f of failed) console.log(`  [${f.type}] ${f.status || f.error} ${f.url}`);
  } else {
    console.log('\nNo failed document/script/xhr/fetch/image requests.');
  }

  if (failOnResourceErrors && failed.length) {
    process.exit(1);
  }
} finally {
  await browser.close();
}
