/*
 * AIMarket postdeploy hook (CommonJS, cross-platform).
 *
 * The React storefront needs the API's public URL baked in at BUILD time
 * (Vite inlines `VITE_API_URL`). The API URL is not known until after
 * provisioning, so azd's initial `web` image is built with the default
 * `/api` base and cannot reach the API. This hook rebuilds the web image
 * with the real `VITE_API_URL=<API_URL>/api` via a local buildx build
 * (native builder stage through $BUILDPLATFORM + COPY-only final stage, so no
 * QEMU emulation is needed to target linux/amd64), pushes it to ACR, updates
 * the web Container App, waits for the new revision, and verifies the
 * production storefront references the API host.
 *
 * All external tools are invoked with argument arrays (no shell string
 * interpolation). Path handling, retries, timestamps and JSON parsing are
 * done in JavaScript so the hook works on Windows, macOS and Linux.
 *
 * A filtered deploy (`azd deploy web`) can skip project-level hooks; run this
 * file directly afterwards:  node infra/hooks/postdeploy.js
 */
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const CLIENT_DIR = path.join(APP_ROOT, 'client');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    cwd: opts.cwd,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Read an azd environment value, preferring the already-exported env var. */
function envValue(name) {
  if (process.env[name] && process.env[name].trim() !== '') {
    return process.env[name].trim();
  }
  try {
    return run('azd', ['env', 'get-value', name], { capture: true }).trim();
  } catch {
    return '';
  }
}

function required(name) {
  const value = envValue(name);
  if (!value) {
    throw new Error(`Missing required azd output '${name}'. Run \`azd provision\` first.`);
  }
  return value;
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyStorefront(webUrl, apiHost) {
  // Poll until the served HTML pulls a JS asset that references the API host.
  const deadline = Date.now() + 5 * 60 * 1000;
  let lastError = 'no attempt';
  while (Date.now() < deadline) {
    try {
      const page = await fetchText(webUrl, 30000);
      if (page.status === 200) {
        const sources = [...page.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
        for (const src of sources.slice(0, 10)) {
          const assetUrl = new URL(src, `${webUrl.replace(/\/+$/, '')}/`).toString();
          const asset = await fetchText(assetUrl, 30000);
          if (asset.status === 200 && asset.body.includes(apiHost)) {
            return true;
          }
        }
        lastError = 'storefront assets do not yet reference the API host';
      } else {
        lastError = `storefront returned HTTP ${page.status}`;
      }
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`Storefront verification failed: ${lastError}`);
}

async function main() {
  const apiUrl = required('API_URL');
  const webUrl = required('WEB_URL');
  const acrLoginServer = required('AZURE_CONTAINER_REGISTRY_ENDPOINT');
  const acrName = required('AZURE_CONTAINER_REGISTRY_NAME');
  const resourceGroup = required('RESOURCE_GROUP_NAME');
  const webAppName = required('WEB_CONTAINER_APP_NAME');

  const viteApiUrl = `${apiUrl.replace(/\/+$/, '')}/api`;
  const apiHost = new URL(apiUrl).host;
  const tag = `postdeploy-${Date.now()}`;
  const imageRef = `${acrLoginServer}/aimarket-web:${tag}`;

  console.log(`[postdeploy] Rebuilding storefront with VITE_API_URL=${viteApiUrl}`);
  console.log(`[postdeploy] Local buildx (linux/amd64, native builder stage) -> ${imageRef}`);

  // ACR's classic build task cannot parse the BuildKit `FROM --platform=$BUILDPLATFORM`
  // line, so the web image is built locally with buildx. The builder stage runs
  // natively on the host arch via $BUILDPLATFORM (esbuild/Vite never emulated) and
  // the final nginx stage is COPY-only, so producing a linux/amd64 image needs NO
  // privileged QEMU emulation. Provenance/attestation is disabled for a clean
  // single-arch manifest that Azure Container Apps can pull directly.
  run('az', ['acr', 'login', '--name', acrName]);
  run('docker', [
    'buildx', 'build',
    '--platform', 'linux/amd64',
    '--provenance=false',
    '--build-arg', `VITE_API_URL=${viteApiUrl}`,
    '--file', 'Dockerfile',
    '--tag', imageRef,
    '--push',
    '.',
  ], { cwd: CLIENT_DIR });

  console.log(`[postdeploy] Updating web Container App '${webAppName}' to ${imageRef}`);
  run('az', [
    'containerapp', 'update',
    '--name', webAppName,
    '--resource-group', resourceGroup,
    '--image', imageRef,
    '--output', 'none',
  ]);

  console.log('[postdeploy] Waiting for the storefront to serve the production build...');
  await verifyStorefront(webUrl, apiHost);
  console.log(`[postdeploy] Storefront now references API host ${apiHost}. Done.`);
}

main().catch((err) => {
  console.error(`[postdeploy] FAILED: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
