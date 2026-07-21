#!/usr/bin/env node
// Cross-platform azd postprovision hook: sets WEBHOOK_URL on the n8n Container App.
// CommonJS .js so azd runs it with Node on any OS. macOS/Linux invoke CLIs
// directly; Windows uses a static PowerShell program with JSON argument data.
const { spawnSync } = require('node:child_process');

const WINDOWS_CLI_RUNNER = [
  "$ErrorActionPreference = 'Stop'",
  '$payload = ConvertFrom-Json -InputObject $env:AZURE_NATIVE_CLI_PAYLOAD',
  '$command = [string]$payload[0]',
  '$arguments = @($payload | Select-Object -Skip 1)',
  '$resolved = Get-Command -Name $command -ErrorAction Stop',
  '$target = [string]$resolved.Source',
  'if (-not $target) { $target = $command }',
  'if ($target.EndsWith(".cmd", [System.StringComparison]::OrdinalIgnoreCase) -or $target.EndsWith(".bat", [System.StringComparison]::OrdinalIgnoreCase)) {',
  '  foreach ($argument in $arguments) { if (([string]$argument).Contains([char]34)) { [Console]::Error.WriteLine("Arguments containing double quotes cannot be passed safely to a Windows .cmd/.bat shim."); exit 2 } }',
  '}',
  '& $target @arguments',
  '$ok = $?',
  '$code = $LASTEXITCODE',
  'if ($null -ne $code) { exit $code }',
  'if (-not $ok) { exit 1 }',
].join('; ');

function runCli(command, args, { stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
  const invocation = process.platform === 'win32'
    ? {
        file: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_CLI_RUNNER],
        env: { ...process.env, AZURE_NATIVE_CLI_PAYLOAD: JSON.stringify([command, ...args]) },
      }
    : { file: command, args, env: process.env };
  const result = spawnSync(invocation.file, invocation.args, {
    encoding: 'utf8',
    env: invocation.env,
    shell: false,
    stdio,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout || '';
}

function readAzdValue(key) {
  try {
    return runCli('azd', ['env', 'get-value', key]).trim();
  } catch {
    return '';
  }
}

function fail(message) {
  console.error(`[postprovision] ${message}`);
  process.exit(1);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRevisionReady(baseUrl) {
  const deadline = Date.now() + 5 * 60 * 1000;
  const requiredConsecutiveSuccesses = 6;
  let consecutiveSuccesses = 0;
  let lastResult = 'no probe completed';
  const normalizedUrl = baseUrl.replace(/\/+$/, '');

  while (Date.now() < deadline) {
    try {
      const [health, editor] = await Promise.all([
        fetch(`${normalizedUrl}/healthz`, { redirect: 'follow', cache: 'no-store' }),
        fetch(normalizedUrl, { redirect: 'follow', cache: 'no-store' }),
      ]);
      if (health.status === 200 && editor.status === 200) {
        consecutiveSuccesses += 1;
        lastResult = `/healthz=200, editor=200 (${consecutiveSuccesses}/${requiredConsecutiveSuccesses} consecutive)`;
        if (consecutiveSuccesses >= requiredConsecutiveSuccesses) return;
      } else {
        consecutiveSuccesses = 0;
        lastResult = `/healthz=${health.status}, editor=${editor.status}`;
      }
    } catch (err) {
      consecutiveSuccesses = 0;
      lastResult = err && err.message ? err.message : String(err);
    }
    await sleep(5000);
  }

  throw new Error(`Replacement revision did not remain ready within 5 minutes (${lastResult}).`);
}

async function main() {
const appName = readAzdValue('N8N_CONTAINER_APP_NAME');
const resourceGroup = readAzdValue('RESOURCE_GROUP_NAME');
let n8nUrl = readAzdValue('N8N_URL');

if (!appName || !resourceGroup) {
  fail('Missing N8N_CONTAINER_APP_NAME or RESOURCE_GROUP_NAME from azd outputs.');
}

// Resolve the FQDN directly from the live Container App if the URL output is absent.
if (!n8nUrl) {
  try {
    const fqdn = runCli(
      'az',
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
      ]
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
  runCli(
    'az',
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
  runCli('azd', ['env', 'set', 'WEBHOOK_URL', n8nUrl], { stdio: 'ignore' });
} catch {
  // Non-fatal: the container env var is the source of truth.
}

console.log('[postprovision] Waiting for the replacement revision and editor UI...');
await waitForRevisionReady(n8nUrl);
console.log('[postprovision] WEBHOOK_URL configured and replacement revision is ready.');
}

module.exports = { runCli };

if (require.main === module) {
  main().catch((err) => {
    console.error(`[postprovision] ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
}
