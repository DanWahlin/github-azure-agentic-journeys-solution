// Cross-platform azd postprovision hook for Superset on AKS.
// Uses argument arrays (shell: false) for az, helm, and kubectl.
// Never prints secret values.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestsDir = join(__dirname, '..', 'manifests');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    ...opts,
  });
  if (res.error) throw res.error;
  if (!opts.allowFail && res.status !== 0) {
    const detail = opts.capture ? `\n${res.stdout || ''}${res.stderr || ''}` : '';
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}${detail}`);
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
  const res = spawnSync('azd', ['env', 'set', name, value], {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollLoadBalancerIp() {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = run(
      'kubectl',
      ['get', 'svc', '-n', 'ingress-nginx', 'ingress-nginx-controller',
        '-o', 'jsonpath={.status.loadBalancer.ingress[0].ip}'],
      { capture: true, allowFail: true }
    );
    const ip = (res.stdout || '').trim();
    if (ip) return ip;
    console.log('Waiting for NGINX ingress LoadBalancer public IP...');
    await sleep(15000);
  }
  throw new Error('Timed out waiting for LoadBalancer public IP');
}

async function main() {
  const env = getAzdEnv();

  const rg = env.AZURE_RESOURCE_GROUP;
  const aksName = env.AZURE_AKS_CLUSTER_NAME;
  const pgHost = env.POSTGRES_HOST;
  const pgDb = env.POSTGRES_DATABASE || 'superset';
  const pgUser = env.POSTGRES_USER;
  const pgPassword = env.POSTGRES_PASSWORD;
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

  for (const [k, v] of Object.entries({
    AZURE_RESOURCE_GROUP: rg, AZURE_AKS_CLUSTER_NAME: aksName, POSTGRES_HOST: pgHost,
    POSTGRES_USER: pgUser, POSTGRES_PASSWORD: pgPassword,
    SUPERSET_SECRET_KEY: secretKey, SUPERSET_ADMIN_PASSWORD: adminPassword,
  })) {
    if (!v) throw new Error(`Missing required azd env value: ${k}`);
  }

  console.log(`Fetching AKS credentials for ${aksName}...`);
  run('az', ['aks', 'get-credentials', '--resource-group', rg, '--name', aksName,
    '--overwrite-existing', '--only-show-errors']);

  // Wait for the API server / nodes to be reachable.
  console.log('Waiting for cluster nodes to be Ready...');
  run('kubectl', ['wait', '--for=condition=Ready', 'nodes', '--all', '--timeout=300s']);

  console.log('Installing NGINX Ingress Controller via Helm...');
  run('helm', ['repo', 'add', 'ingress-nginx', 'https://kubernetes.github.io/ingress-nginx',
    '--force-update']);
  run('helm', ['repo', 'update', 'ingress-nginx']);
  run('helm', ['upgrade', '--install', 'ingress-nginx', 'ingress-nginx/ingress-nginx',
    '--namespace', 'ingress-nginx', '--create-namespace',
    '--set', 'controller.service.externalTrafficPolicy=Local',
    '--set', 'controller.admissionWebhooks.enabled=false',
    '--wait', '--timeout', '10m']);

  // Build PostgreSQL connection string with URL-encoded credentials.
  const uri = `postgresql://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPassword)}` +
    `@${pgHost}:5432/${pgDb}?sslmode=require`;

  console.log('Applying namespace and config...');
  run('kubectl', ['apply', '-f', join(manifestsDir, '00-namespace.yaml')]);
  run('kubectl', ['apply', '-f', join(manifestsDir, '10-configmap.yaml')]);

  console.log('Creating Superset secret (values not printed)...');
  run('kubectl', ['delete', 'secret', 'superset-secrets', '-n', 'superset',
    '--ignore-not-found=true']);
  run('kubectl', ['create', 'secret', 'generic', 'superset-secrets', '-n', 'superset',
    `--from-literal=database-uri=${uri}`,
    `--from-literal=secret-key=${secretKey}`,
    `--from-literal=admin-password=${adminPassword}`]);

  console.log('Applying Superset deployment, service, and ingress...');
  run('kubectl', ['apply', '-f', join(manifestsDir, '20-deployment.yaml')]);
  run('kubectl', ['apply', '-f', join(manifestsDir, '30-service.yaml')]);
  run('kubectl', ['apply', '-f', join(manifestsDir, '40-ingress.yaml')]);

  console.log('Waiting for Superset rollout (init + migrations can take several minutes)...');
  run('kubectl', ['rollout', 'status', 'deployment/superset', '-n', 'superset',
    '--timeout=900s']);

  const ip = await pollLoadBalancerIp();
  const url = `http://${ip}`;
  run('azd', ['env', 'set', 'SUPERSET_URL', url]);

  console.log('Superset post-provision complete.');
  console.log(`DEPLOYED_URL=${url}`);
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
