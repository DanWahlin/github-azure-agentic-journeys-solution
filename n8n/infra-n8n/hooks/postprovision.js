#!/usr/bin/env node
// Cross-platform azd postprovision hook: sets WEBHOOK_URL on the n8n Container App.
// CommonJS .js so azd (which does not accept .mjs) runs it with `node` on any OS.
// Uses execFileSync with argument arrays only — no shell string interpolation,
// no chmod, no command substitution. Works on Windows, macOS, and Linux.
const { execFileSync } = require('node:child_process');

const azExe = process.platform === 'win32' ? 'az.cmd' : 'az';
const azdExe = process.platform === 'win32' ? 'azd.cmd' : 'azd';

function readAzdValue(key) {
  try {
    return execFileSync(azdExe, ['env', 'get-value', key], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function fail(message) {
  console.error(`[postprovision] ${message}`);
  process.exit(1);
}

const appName = readAzdValue('N8N_CONTAINER_APP_NAME');
const resourceGroup = readAzdValue('RESOURCE_GROUP_NAME');
let n8nUrl = readAzdValue('N8N_URL');

if (!appName || !resourceGroup) {
  fail('Missing N8N_CONTAINER_APP_NAME or RESOURCE_GROUP_NAME from azd outputs.');
}

// Resolve the FQDN directly from the live Container App if the URL output is absent.
if (!n8nUrl) {
  try {
    const fqdn = execFileSync(
      azExe,
      [
        'containerapp',
        'show',
        '--name',
        appName,
        '--resource-group',
        resourceGroup,
        '--query',
        'properties.configuration.ingress.fqdn',
        '--output',
        'tsv',
      ],
      { encoding: 'utf8' }
    ).trim();
    if (!fqdn) {
      fail('Could not resolve Container App FQDN.');
    }
    n8nUrl = `https://${fqdn}`;
  } catch (err) {
    fail(`Failed to read Container App FQDN: ${err.message}`);
  }
}

console.log(`[postprovision] Setting WEBHOOK_URL=${n8nUrl} on ${appName}`);

try {
  execFileSync(
    azExe,
    [
      'containerapp',
      'update',
      '--name',
      appName,
      '--resource-group',
      resourceGroup,
      '--set-env-vars',
      `WEBHOOK_URL=${n8nUrl}`,
      '--output',
      'none',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
} catch (err) {
  fail(`Failed to set WEBHOOK_URL: ${err.message}`);
}

// Persist for downstream tooling / reporting.
try {
  execFileSync(azdExe, ['env', 'set', 'WEBHOOK_URL', n8nUrl], { stdio: 'ignore' });
} catch {
  // Non-fatal: the container env var is the source of truth.
}

console.log('[postprovision] WEBHOOK_URL configured successfully.');
