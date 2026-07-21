'use strict';

// Cross-platform azd post-provision hook for Superset on AKS.
// Runs Helm and kubectl inside Azure through `az aks command invoke`.
// The host needs only az, azd, and Node.js. Secret values are never printed.
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const manifestsDir = join(__dirname, '..', 'manifests');
const WINDOWS_CLI_RUNNER = [
  "$ErrorActionPreference = 'Stop'",
  '$payload = ConvertFrom-Json -InputObject $env:AZURE_NATIVE_CLI_PAYLOAD',
  '$command = [string]$payload[0]',
  '$arguments = @($payload | Select-Object -Skip 1)',
  '$resolved = Get-Command -Name $command -ErrorAction Stop',
  '$target = [string]$resolved.Source',
  'if (-not $target) { $target = $command }',
  'foreach ($argument in $arguments) { if (([string]$argument).Contains([char]34)) { [Console]::Error.WriteLine("Arguments containing double quotes cannot be passed safely through Windows PowerShell."); exit 2 } }',
  'if ($target.EndsWith(".cmd", [System.StringComparison]::OrdinalIgnoreCase) -or $target.EndsWith(".bat", [System.StringComparison]::OrdinalIgnoreCase)) {',
  "  $unsafe = [char[]]'&|<>^%!()'",
  '  foreach ($argument in $arguments) { $text = [string]$argument; if ($text.IndexOfAny($unsafe) -ge 0 -or $text.Contains([char]10) -or $text.Contains([char]13)) { [Console]::Error.WriteLine("Arguments containing shell metacharacters or control characters cannot be passed safely to a Windows .cmd/.bat shim."); exit 2 } }',
  '}',
  '& $target @arguments',
  '$ok = $?',
  '$code = $LASTEXITCODE',
  'if ($null -ne $code) { exit $code }',
  'if (-not $ok) { exit 1 }',
].join('; ');

function run(cmd, args, opts = {}) {
  const invocation = process.platform === 'win32'
    ? {
        file: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_CLI_RUNNER],
        env: { ...process.env, AZURE_NATIVE_CLI_PAYLOAD: JSON.stringify([cmd, ...args]) },
      }
    : { file: cmd, args, env: process.env };
  const res = spawnSync(invocation.file, invocation.args, {
    stdio: opts.stdio || (opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'),
    encoding: 'utf8',
    cwd: opts.cwd,
    env: invocation.env,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const detail = opts.capture ? `\n${res.stdout || ''}${res.stderr || ''}` : '';
    const command = opts.redact ? `${cmd} [arguments redacted]` : `${cmd} ${args.join(' ')}`;
    throw new Error(`Command failed (${res.status}): ${command}${detail}`);
  }
  return res;
}

function getAzdEnv() {
  const res = run('azd', ['env', 'get-values', '--output', 'json'], { capture: true });
  return JSON.parse(res.stdout);
}

function ensureAzdSecret(env, name, createValue) {
  if (env[name]) return env[name];

  const value = createValue();
  try {
    run('azd', ['env', 'set', name, value], { stdio: 'ignore', redact: true });
  } catch {
    throw new Error(`Failed to persist generated azd secret: ${name}`);
  }
  env[name] = value;
  console.log(`Generated and persisted missing ${name} (value not printed).`);
  return value;
}

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function makeRemoteBundle({ databaseUri, secretKey, adminPassword }) {
  const stagingDir = mkdtempSync(join(tmpdir(), 'superset-aks-'));
  chmodSync(stagingDir, 0o700);
  const manifestNames = [
    '00-namespace.yaml',
    '10-configmap.yaml',
    '20-deployment.yaml',
    '30-service.yaml',
    '40-ingress.yaml',
  ];
  for (const name of manifestNames) {
    copyFileSync(join(manifestsDir, name), join(stagingDir, name));
  }

  writeFileSync(join(stagingDir, 'superset-secrets.yaml'), `apiVersion: v1
kind: Secret
metadata:
  name: superset-secrets
  namespace: superset
type: Opaque
data:
  database-uri: ${encode(databaseUri)}
  secret-key: ${encode(secretKey)}
  admin-password: ${encode(adminPassword)}
`, { mode: 0o600 });

  const scriptPath = join(stagingDir, 'deploy.sh');
  writeFileSync(scriptPath, `#!/usr/bin/env bash
set -euo pipefail

kubectl wait --for=condition=Ready nodes --all --timeout=300s
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx --force-update
helm repo update ingress-nginx
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \\
  --namespace ingress-nginx --create-namespace \\
  --set controller.service.externalTrafficPolicy=Local \\
  --set controller.admissionWebhooks.enabled=false \\
  --wait --timeout 10m

kubectl apply -f 00-namespace.yaml
kubectl apply -f 10-configmap.yaml
kubectl apply -f superset-secrets.yaml
rm -f superset-secrets.yaml
kubectl apply -f 20-deployment.yaml
kubectl apply -f 30-service.yaml
kubectl apply -f 40-ingress.yaml
kubectl rollout status deployment/superset -n superset --timeout=900s
`, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);
  return stagingDir;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseResult(output, context) {
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error(`${context} returned invalid JSON: ${(output || '').slice(0, 500)}`);
  }
  return result;
}

async function invokeRemoteDeployment(resourceGroup, clusterName, stagingDir) {
  const res = run('az', [
    'aks', 'command', 'invoke',
    '--resource-group', resourceGroup,
    '--name', clusterName,
    '--command', 'bash deploy.sh',
    '--file', '.',
    '--no-wait',
    '--only-show-errors',
  ], { capture: true, cwd: stagingDir });

  const startOutput = `${res.stdout || ''}\n${res.stderr || ''}`;
  const idMatch = startOutput.match(/command id:\s*([0-9a-f-]+)/i);
  if (!idMatch) {
    throw new Error(`AKS command did not return a command ID: ${startOutput.slice(0, 500)}`);
  }

  const commandId = idMatch[1];
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const resultResponse = run('az', [
      'aks', 'command', 'result',
      '--resource-group', resourceGroup,
      '--name', clusterName,
      '--command-id', commandId,
      '--output', 'json',
      '--only-show-errors',
    ], { capture: true });
    const resultOutput = `${resultResponse.stdout || ''}\n${resultResponse.stderr || ''}`;
    if (/status:\s*Running/i.test(resultOutput) && !resultOutput.trimStart().startsWith('{')) {
      await sleep(10000);
      continue;
    }
    const result = parseResult(resultResponse.stdout, 'AKS command result');
    if (result.provisioningState === 'Succeeded') {
      if (result.exitCode === 0) return result;
      throw new Error(`Remote AKS deployment returned no successful exit code (${result.exitCode ?? 'missing'}):\n${result.logs || result.reason || ''}`);
    }
    if (result.provisioningState === 'Failed' ||
        (result.exitCode !== null && result.exitCode !== undefined && result.exitCode !== 0)) {
      throw new Error(`Remote AKS deployment failed (${result.exitCode ?? 'unknown'}):\n${result.logs || result.reason || ''}`);
    }
    await sleep(10000);
  }
  throw new Error(`Timed out waiting for AKS command ${commandId}`);
}

function invokeShortCommand(resourceGroup, clusterName, command) {
  const res = run('az', [
    'aks', 'command', 'invoke',
    '--resource-group', resourceGroup,
    '--name', clusterName,
    '--command', command,
    '--output', 'json',
    '--only-show-errors',
  ], { capture: true });
  const result = parseResult(res.stdout, 'AKS command');
  if (result.provisioningState !== 'Succeeded' || result.exitCode !== 0) {
    throw new Error(`Remote AKS command failed (${result.exitCode ?? 'unknown'}):\n${result.logs || result.reason || ''}`);
  }
  return (result.logs || '').trim();
}

async function waitForIngressIp(resourceGroup, clusterName) {
  const deadline = Date.now() + 10 * 60 * 1000;
  const command = "kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'";
  while (Date.now() < deadline) {
    const ip = invokeShortCommand(resourceGroup, clusterName, command);
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
    console.log('Waiting for NGINX ingress LoadBalancer public IP...');
    await sleep(15000);
  }
  throw new Error('Timed out waiting for LoadBalancer public IP');
}

async function main() {
  const env = getAzdEnv();
  const resourceGroup = env.AZURE_RESOURCE_GROUP;
  const clusterName = env.AZURE_AKS_CLUSTER_NAME;
  const postgresHost = env.POSTGRES_HOST;
  const postgresDatabase = env.POSTGRES_DATABASE || 'superset';
  const postgresUser = env.POSTGRES_USER;
  const postgresPassword = env.POSTGRES_PASSWORD;
  const secretKey = ensureAzdSecret(
    env,
    'SUPERSET_SECRET_KEY',
    () => randomBytes(48).toString('base64url')
  );
  const adminPassword = ensureAzdSecret(
    env,
    'SUPERSET_ADMIN_PASSWORD',
    () => `Aa1!${randomBytes(24).toString('base64url')}`
  );

  for (const [name, value] of Object.entries({
    AZURE_RESOURCE_GROUP: resourceGroup,
    AZURE_AKS_CLUSTER_NAME: clusterName,
    POSTGRES_HOST: postgresHost,
    POSTGRES_USER: postgresUser,
    POSTGRES_PASSWORD: postgresPassword,
  })) {
    if (!value) throw new Error(`Missing required azd env value: ${name}`);
  }

  const databaseUri = `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}` +
    `@${postgresHost}:5432/${postgresDatabase}?sslmode=require`;
  const stagingDir = makeRemoteBundle({ databaseUri, secretKey, adminPassword });
  try {
    console.log(`Deploying Superset to AKS '${clusterName}' through Azure run command...`);
    await invokeRemoteDeployment(resourceGroup, clusterName, stagingDir);
    const ip = await waitForIngressIp(resourceGroup, clusterName);
    const url = `http://${ip}`;
    run('azd', ['env', 'set', 'SUPERSET_URL', url]);
    console.log('Superset post-provision complete.');
    console.log(`DEPLOYED_URL=${url}`);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
