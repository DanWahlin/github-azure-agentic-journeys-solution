#!/usr/bin/env node
// Capture a screenshot of a public page using Playwright's bundled Chromium.
// Never requires the branded Chrome channel. Reports failed document/script/
// XHR/fetch/image requests and can fail the run on resource errors.
import { chromium } from 'playwright';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    output: { type: 'string' },
    'fail-on-resource-errors': { type: 'string', default: 'false' },
  },
});

if (!values.url || !values.output) {
  console.error('Usage: capture-screenshot.mjs --url <url> --output <png> [--fail-on-resource-errors true]');
  process.exit(2);
}

const failOnResourceErrors = values['fail-on-resource-errors'] === 'true';
const resourceFailures = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('requestfailed', (req) => {
    resourceFailures.push(`${req.resourceType()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`);
  });
  page.on('response', (res) => {
    // n8n's SPA intentionally probes /rest/login on a fresh instance and receives
    // HTTP 401 before showing the owner-setup screen. That is expected auth behavior,
    // not a broken resource, so it is not treated as a failure.
    const expectedAuthProbe = res.status() === 401 && /\/rest\/(login|settings)/.test(res.url());
    if (res.status() >= 400 && !expectedAuthProbe) {
      resourceFailures.push(`${res.request().resourceType()} ${res.url()} :: HTTP ${res.status()}`);
    }
  });
  await page.goto(values.url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: values.output, fullPage: true });
  console.log(`Screenshot saved: ${values.output}`);
  console.log(`Page title: ${await page.title()}`);
} finally {
  await browser.close();
}

if (resourceFailures.length) {
  console.log('\nResource failures:');
  for (const f of resourceFailures) console.log(`  - ${f}`);
  if (failOnResourceErrors) {
    console.error(`\nFailing: ${resourceFailures.length} resource error(s).`);
    process.exit(1);
  }
} else {
  console.log('\nNo resource failures detected.');
}
