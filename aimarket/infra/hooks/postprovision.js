/*
 * AIMarket postprovision hook (CommonJS, cross-platform).
 *
 * Implements the deterministic two-phase ACR-pull pattern from the
 * container-apps-deployment skill:
 *   1. Bicep provisions each Container App with a PUBLIC placeholder image and a
 *      system-assigned identity, and grants that identity `AcrPull` on the ACR.
 *   2. This hook (which runs AFTER provisioning, BEFORE `azd deploy`) writes the
 *      explicit `configuration.registries` entry with `identity: system` on each
 *      app once the AcrPull role assignment is effective.
 *
 * The `registries` block is intentionally NOT baked into the initial Bicep:
 * Azure Container Apps validates every configured registry when it creates the
 * first revision, and with system identity that validation fails (and the
 * revision never gets created) until AcrPull has propagated. Configuring the
 * registry here breaks that chicken-and-egg without leaking ACR admin creds.
 *
 * All external tools are invoked with argument arrays (no shell interpolation),
 * so the hook works on Windows, macOS and Linux.
 */
'use strict';

const { execFileSync } = require('node:child_process');

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

function cliInvocation(cmd, args) {
  if (process.platform !== 'win32') return { file: cmd, args, env: process.env };
  return {
    file: 'powershell.exe',
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_CLI_RUNNER],
    env: { ...process.env, AZURE_NATIVE_CLI_PAYLOAD: JSON.stringify([cmd, ...args]) },
  };
}

function run(cmd, args, capture) {
  const invocation = cliInvocation(cmd, args);
  return execFileSync(invocation.file, invocation.args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: invocation.env,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function envValue(name) {
  if (process.env[name] && process.env[name].trim() !== '') {
    return process.env[name].trim();
  }
  try {
    return run('azd', ['env', 'get-value', name], true).trim();
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setRegistry(appName, resourceGroup, loginServer) {
  // Retry to absorb AcrPull role-assignment propagation delay.
  const maxAttempts = 10;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[postprovision] (${appName}) registry set --identity system (attempt ${attempt})`);
      run('az', [
        'containerapp', 'registry', 'set',
        '--name', appName,
        '--resource-group', resourceGroup,
        '--server', loginServer,
        '--identity', 'system',
        '--output', 'none',
      ]);
      console.log(`[postprovision] (${appName}) registry configured with system identity.`);
      return;
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
      console.log(`[postprovision] (${appName}) not ready yet: ${lastError.split('\n')[0]}`);
      await sleep(15000);
    }
  }
  throw new Error(`Failed to configure registry on ${appName}: ${lastError}`);
}

async function main() {
  const resourceGroup = required('RESOURCE_GROUP_NAME');
  const loginServer = required('AZURE_CONTAINER_REGISTRY_ENDPOINT');
  const apiApp = required('API_CONTAINER_APP_NAME');
  const webApp = required('WEB_CONTAINER_APP_NAME');

  await setRegistry(apiApp, resourceGroup, loginServer);
  await setRegistry(webApp, resourceGroup, loginServer);
  console.log('[postprovision] Both Container Apps can now pull private images via system identity.');
}

main().catch((err) => {
  console.error(`[postprovision] FAILED: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
