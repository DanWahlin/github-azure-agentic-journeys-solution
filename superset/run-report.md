# Superset on AKS — Journey Run Report

**Result:** ✅ SUCCESS — Superset deployed to Azure Kubernetes Service, verified with live requests and browser login, and deleted after verification.

> **Current contract:** The metadata below records the original run. The checked-in deployment now runs Helm and `kubectl` inside Azure through AKS run command. The host requires Azure CLI, Azure Developer CLI, and Node.js, not local Helm or `kubectl`.

## Run Metadata

| Field | Value |
|---|---|
| Journey | Apache Superset on AKS (`superset/JOURNEY.md`) |
| Stack | AKS + PostgreSQL Flexible Server (Bicep + azd) |
| Host OS / arch | Linux ARM64 |
| Source commit | `0382099` |
| Workspace | `superset/` (this folder; all artifacts generated here) |
| azd environment | `rr-superset-0717` |
| Subscription | `[REDACTED]` (Visual Studio Enterprise) |
| Location | `westus` |
| Resource group | `rg-rr-superset-0717` |
| Superset image | `apache/superset:4.1.1` (pinned) |
| Superset URL | `http://20.253.212.180` |

### Tool versions
- node v24.13.0
- az 2.88.0
- azd 1.28.0
- kubectl v1.35.0
- helm v3.21.3
- playwright 1.58.2 (bundled Chromium)

## Generated Artifacts (all under `superset/`)

```
azure.yaml                              # azd config; postprovision -> node hook (no shell logic)
infra-superset/
  main.bicep                            # subscription scope; creates RG rg-<env>
  resources.bicep                       # RG scope: Log Analytics, PostgreSQL, AKS (raw Microsoft.*)
  main.parameters.json
  hooks/postprovision.js                # AKS run command: Helm NGINX, manifests, LB poll, rollout
  manifests/00-namespace.yaml
  manifests/10-configmap.yaml           # superset_config.py bridge (env -> SQLALCHEMY_DATABASE_URI)
  manifests/20-deployment.yaml          # init+main, shared emptyDir psycopg2, probes
  manifests/30-service.yaml             # ClusterIP 80 -> 8088
  manifests/40-ingress.yaml             # nginx ingress
scripts/verify-superset.mjs             # pods/logs/health verification
scripts/capture-screenshot.mjs          # Playwright bundled Chromium login + screenshot
screenshot-superset.png                 # authenticated /superset/welcome/ page
run-report.md, issues.md
```

## Phase Results

| Phase | Result | Evidence |
|---|---|---|
| Preflight (tools, auth, quota) | PASS | node/az/azd present; sub authenticated; DSv3 quota 4/20 used → 16 free (need 4); providers registered |
| Infra generation | PASS | Bicep + azure.yaml + 5 manifests + portable CommonJS `.js` hook |
| Validation | PASS | `az bicep build` clean; YAML + embedded `superset_config.py` parsed/compiled; hook `node --check` OK |
| azd up (provision) | PASS | 10m24s — RG, Log Analytics, PostgreSQL (5m5s), AKS (5m4s) |
| Postprovision hook | PASS | AKS run command installed Helm NGINX, applied secret + manifests, completed rollout, discovered the LB IP, and set `SUPERSET_URL` |
| Verification | PASS | 6/6 checks (see below) |
| Browser login | PASS | Reached `/superset/welcome/`; screenshot captured |

## Verification Detail (`scripts/verify-superset.mjs` — 6/6 PASS)

```
PASS  Pod superset-7db6ccc857-wj69w Ready 1/1 (Running)
PASS  Init logs contain PostgresqlImpl
PASS  Init logs have no SQLiteImpl fallback
PASS  Main logs retrieved with no SQLiteImpl fallback
PASS  psycopg2 importable in main container
PASS  GET /health returns HTTP 200 — status=200 body=OK
```

- **PostgreSQL (not SQLite) proven:** init log line `INFO [alembic.runtime.migration] Context impl PostgresqlImpl.`; zero `SQLiteImpl` matches in init or main logs; `import psycopg2` succeeds in the main container.
- **Health:** `GET http://20.253.212.180/health` → HTTP 200, body `OK` (re-confirmed post-run).
- **Browser login:** Playwright bundled Chromium filled `#username` / `#password`, submitted, and navigated to `/superset/welcome/` (authenticated Home page with Dashboards/Charts/Datasets/SQL). Credentials never printed. See `screenshot-superset.png`.

## Requirements Compliance

- ✅ AKS (not Container Apps); PostgreSQL (not SQLite).
- ✅ AKS system pool created with **no availability zones** (property omitted) — safe for westus.
- ✅ Shared `emptyDir` psycopg2 pattern: init installs `psycopg2-binary --target=/psycopg2-lib`; both containers set `PYTHONPATH=/psycopg2-lib` and mount the shared volume.
- ✅ Secure credentials generated with Node `crypto` (POSTGRES_PASSWORD, SUPERSET_SECRET_KEY, SUPERSET_ADMIN_PASSWORD), pinned in azd env, never printed or committed. K8s secret created at deploy time by the hook — no plaintext secret files.
- ✅ Portable hook: `postprovision.js` invokes `az`/`azd` with argument arrays and runs Helm/`kubectl` inside Azure through AKS run command. Windows uses the static PowerShell JSON-payload launcher; macOS/Linux invoke CLIs directly.
- ✅ Validation before `azd up` (Bicep build, manifest parse, hook syntax).
- ✅ All artifacts generated inside `superset/`; no resources touched outside `rr-superset-0717` / `rg-rr-superset-0717`.

## Owned Resource Inventory (at verification time)

Resource group **`rg-rr-superset-0717`** (tags: `azd-env-name=rr-superset-0717`, `journey=superset`):

| Resource | Type |
|---|---|
| `aks-5555lf475ficw` | Microsoft.ContainerService/managedClusters |
| `psql-5555lf475ficw` | Microsoft.DBforPostgreSQL/flexibleServers |
| `log-5555lf475ficw` | Microsoft.OperationalInsights/workspaces |
| `ContainerInsights(log-5555lf475ficw)` | Microsoft.OperationsManagement/solutions |

AKS-managed node resource group: **`MC_rg-rr-superset-0717_aks-5555lf475ficw_westus`** (VMSS `aks-system-30149138-vmss`, 2× Standard_D2s_v3, Standard Load Balancer public IP `20.253.212.180`).

> ⚠️ Cost note: ~$200–215/month if left running. Tear down with `azd down --force --purge -e rr-superset-0717` when finished.

## Cleanup

Final policy: **delete after successful verification**. `rg-rr-superset-0717` and its AKS-managed group `MC_rg-rr-superset-0717_aks-5555lf475ficw_westus` were deleted; live Azure queries returned `false` for both. No unrelated resources were modified or deleted.

## Blockers / Limitations

- One journey selector defect found and worked around (see `issues.md`): the documented submit selector `button:has-text("Sign in")` does not match the `apache/superset:4.1.1` login form, which renders `<input type="submit" value="Sign In">`. Login still succeeded via a fallback selector; `#username` / `#password` matched as documented.
