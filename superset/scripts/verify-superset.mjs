// Portable Superset AKS verification. Deterministic exit code.
// Checks: pod Ready 1/1 + Running, init/main logs prove PostgresqlImpl (no SQLite),
// and /health returns HTTP 200. Reads dynamic values via azd. Never prints secrets.
import { spawnSync } from 'node:child_process';

function run(cmd, args, { allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (!allowFail && res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}\n${res.stderr || ''}`);
  }
  return res;
}

function azdEnv() {
  const res = run('azd', ['env', 'get-values', '--output', 'json']);
  return JSON.parse(res.stdout);
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const env = azdEnv();
  const url = env.SUPERSET_URL;
  if (!url) throw new Error('SUPERSET_URL not set in azd environment');

  // 1. Pod status
  const podsJson = JSON.parse(
    run('kubectl', ['get', 'pods', '-n', 'superset', '-l', 'app=superset', '-o', 'json']).stdout
  );
  if (!podsJson.items.length) {
    record('Superset pod exists', false, 'no pods found');
  }
  let podName = null;
  for (const pod of podsJson.items) {
    const phase = pod.status.phase;
    const cs = pod.status.containerStatuses || [];
    const ready = cs.length > 0 && cs.every((c) => c.ready);
    const total = cs.length;
    const readyCount = cs.filter((c) => c.ready).length;
    record(`Pod ${pod.metadata.name} Ready ${readyCount}/${total} (${phase})`,
      phase === 'Running' && ready);
    if (phase === 'Running' && ready) podName = pod.metadata.name;
  }
  if (!podName) podName = podsJson.items[0]?.metadata?.name;
  if (!podName) { finish(); return; }

  // 2. Init container logs — PostgresqlImpl, no SQLiteImpl
  const initLogs = run('kubectl', ['logs', '-n', 'superset', podName, '-c', 'superset-init'],
    { allowFail: true }).stdout || '';
  record('Init logs contain PostgresqlImpl', /PostgresqlImpl/.test(initLogs));
  record('Init logs have no SQLiteImpl fallback', !/SQLiteImpl/.test(initLogs));

  // 3. Main container logs — no SQLite fallback
  const mainLogs = run('kubectl', ['logs', '-n', 'superset', podName, '-c', 'superset'],
    { allowFail: true }).stdout || '';
  record('Main logs have no SQLiteImpl fallback', !/SQLiteImpl/.test(mainLogs));

  // 4. psycopg2 import inside main container
  const psy = run('kubectl', ['exec', '-n', 'superset', podName, '-c', 'superset', '--',
    'python', '-c', 'import psycopg2; print("OK")'], { allowFail: true });
  record('psycopg2 importable in main container', /OK/.test(psy.stdout || ''));

  // 5. /health HTTP 200
  try {
    const resp = await fetch(`${url}/health`, { redirect: 'manual' });
    const body = await resp.text();
    record('GET /health returns HTTP 200', resp.status === 200, `status=${resp.status} body=${body.trim().slice(0, 40)}`);
  } catch (e) {
    record('GET /health returns HTTP 200', false, e.message);
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err.message || String(err)); process.exit(1); });
