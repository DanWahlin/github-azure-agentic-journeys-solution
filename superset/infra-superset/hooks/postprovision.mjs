// Cross-platform azd post-provision hook for Superset on AKS.
// Runs Helm and kubectl inside Azure through `az aks command invoke`.
// The host needs only az, azd, and Node.js. Secret values are never printed.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestsDir = join(__dirname, '..', 'manifests');
const azExe = process.platform === 'win32' ? 'az.cmd' : 'az';
const azdExe = process.platform === 'win32' ? 'azd.cmd' : 'azd';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    cwd: opts.cwd,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const detail = opts.capture ? `\n${res.stdout || ''}${res.stderr || ''}` : '';
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}${detail}`);
  }
  return res;
}

function getAzdEnv() {
  const res = run(azdExe, ['env', 'get-values', '--output', 'json'], { capture: true });
  return JSON.parse(res.stdout);
}

function ensureAzdSecret(env, name, createValue) {
  if (env[name]) return env[name];

  const value = createValue();
  const res = spawnSync(azdExe, ['env', 'set', name, value], {
    stdio: 'ignore',
    encoding: 'utf8',
  });
  if (res.error || res.status !== 0) {
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
kubectl apply -f 20-deployment.yaml
kubectl apply -f 30-service.yaml
kubectl apply -f 40-ingress.yaml
kubectl rollout status deployment/superset -n superset --timeout=900s

ip=""
deadline=$((SECONDS + 600))
while (( SECONDS < deadline )); do
  ip=$(kubectl get svc -n ingress-nginx ingress-nginx-controller \\
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [[ -n "$ip" ]]; then break; fi
  echo "Waiting for NGINX ingress LoadBalancer public IP..."
  sleep 15
done

if [[ -z "$ip" ]]; then
  echo "Timed out waiting for LoadBalancer public IP" >&2
  exit 1
fi

echo "SUPERSET_URL=http://$ip"
`, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);
  return stagingDir;
}

function invokeRemoteDeployment(resourceGroup, clusterName, stagingDir) {
  const res = run(azExe, [
    'aks', 'command', 'invoke',
    '--resource-group', resourceGroup,
    '--name', clusterName,
    '--command', 'bash deploy.sh',
    '--file', '.',
    '--output', 'json',
    '--only-show-errors',
  ], { capture: true, cwd: stagingDir });

  let result;
  try {
    result = JSON.parse(res.stdout);
  } catch {
    throw new Error(`AKS command returned invalid JSON: ${(res.stdout || '').slice(0, 500)}`);
  }
  if (result.exitCode !== 0) {
    throw new Error(`Remote AKS deployment failed (${result.exitCode}):\n${result.logs || result.reason || ''}`);
  }
  return result.logs || '';
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
    const logs = invokeRemoteDeployment(resourceGroup, clusterName, stagingDir);
    const match = logs.match(/^SUPERSET_URL=(https?:\/\/\S+)$/m);
    if (!match) {
      throw new Error(`Remote deployment did not return SUPERSET_URL:\n${logs.slice(-2000)}`);
    }
    const url = match[1];
    run(azdExe, ['env', 'set', 'SUPERSET_URL', url]);
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
