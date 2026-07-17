// Superset login screenshot using Playwright's bundled Chromium.
// Never prints credentials. Usage:
//   node scripts/capture-screenshot.mjs --url http://IP --output out.png \
//     --username admin --password <secret> \
//     --username-selector #username --password-selector #password \
//     --submit-selector "button:has-text('Sign in')" --success-path /superset/welcome/
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  // Fall back to the globally installed Playwright.
  const req = createRequire('/usr/lib/node_modules/');
  ({ chromium } = req('playwright'));
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const url = arg('url');
const output = arg('output', 'screenshot-superset.png');
const username = arg('username', 'admin');
let password = arg('password');
// Fall back to azd env so the secret never transits a shell command line.
if (!password) {
  const r = spawnSync('azd', ['env', 'get-value', 'SUPERSET_ADMIN_PASSWORD'], { encoding: 'utf8' });
  if (r.status === 0) password = (r.stdout || '').trim();
}
const usernameSelector = arg('username-selector', '#username');
const passwordSelector = arg('password-selector', '#password');
const submitSelector = arg('submit-selector', "button:has-text('Sign in')");
const successPath = arg('success-path', '/superset/welcome/');

if (!url || !password) {
  console.error('Missing required --url or --password');
  process.exit(2);
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${url}/login/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(usernameSelector, { timeout: 30000 });
    await page.fill(usernameSelector, username);
    await page.fill(passwordSelector, password);
    // Prefer the documented selector; fall back to the FAB classic form's
    // <input type="submit" value="Sign In"> used by apache/superset 4.1.1.
    let submitLocator = page.locator(submitSelector);
    if ((await submitLocator.count()) === 0) {
      submitLocator = page.locator('input[type="submit"], button[type="submit"]').first();
      console.log(`Documented submit selector not found; using fallback input[type=submit]`);
    }
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      submitLocator.click(),
    ]);
    await page.waitForURL(`**${successPath}**`, { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.screenshot({ path: output, fullPage: false });
    console.log(`Login succeeded; reached ${new URL(page.url()).pathname}`);
    console.log(`Screenshot saved: ${output}`);
    await browser.close();
    process.exit(0);
  } catch (e) {
    // Capture failure state for diagnosis (no credentials in output).
    try { await page.screenshot({ path: output.replace(/\.png$/, '-error.png') }); } catch {}
    console.error(`Screenshot/login failed at ${page.url()}: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
}

main();
