# Grafana Journey — Run Report

**Journey:** Grafana on Azure Container Apps (OSS deployment)
**Runner:** journey-runner workflow via `oss-to-azure-deployer` orchestration
**Status:** ✅ SUCCESS — deployed, verified, screenshotted, and deleted after verification.
**Date (UTC):** 2026-07-17

## Environment

| Item | Value |
|------|-------|
| Host OS / arch | Linux / aarch64 (ARM64) |
| Node.js | v24.13.0 |
| Azure CLI | 2.88.0 |
| azd | 1.28.0 (stable) |
| Playwright | 1.49.x (bundled Chromium) |
| Source commit | 0382099c98530ff244aafe6f729982748377c27e |
| Workspace | grafana/ (this folder; all artifacts generated here) |
| Stack | Single stack: Grafana OSS + Container Apps + SQLite (embedded) |

## Azure Target (owned by this run)

| Item | Value |
|------|-------|
| Subscription | [REDACTED] (Visual Studio Enterprise) |
| Location | westus |
| azd environment | rr-grafana-0717 |
| Resource group | rg-rr-grafana-0717 |
| Tag | azd-env-name=rr-grafana-0717 |

## Generated Artifacts (all inside grafana/)

```
azure.yaml
infra-grafana/
  main.bicep            # subscription scope: RG + module
  resources.bicep       # RG scope: Log Analytics, CAE, Container App
  main.parameters.json
  abbreviations.json
scripts/
  verify-grafana.mjs    # portable verification (health + auth)
  capture-screenshot.mjs
  package.json
screenshot-grafana.png
azd-up.log
run-report.md
```

## Phase Results

| Phase | Command | Result |
|-------|---------|--------|
| Preflight (tools) | `node --version`, `az version`, `azd version`, `uname -m` | PASS — Node 24.13.0, az 2.88.0, azd 1.28.0, aarch64 |
| Auth preflight | `az account show`; `azd config set auth.useAzCliAuth true` | PASS — correct subscription; azd reuses az auth |
| Providers | `az provider register --namespace Microsoft.App` / `Microsoft.OperationalInsights` | PASS — both Registered |
| Bicep compile | `az bicep build --file infra-grafana/main.bicep` | PASS — no errors (exit 0) |
| Preview | `azd provision --preview --no-prompt` | PASS — 4 planned resources incl. rg-rr-grafana-0717 |
| Deploy | `azd up --no-prompt` | PASS — provisioned + deployed in 2m34s |
| Verify | `node scripts/verify-grafana.mjs` | PASS — all 4 checks |
| Screenshot | `node scripts/capture-screenshot.mjs --url <URL>/login --fail-on-resource-errors true` | PASS — no failed resource requests |

## Deployment Details

Resources created (via `azd up`):

- Resource group `rg-rr-grafana-0717` (3.66s)
- Log Analytics workspace `log-xhq7rqjkxre3u` (25.0s) — `Microsoft.OperationalInsights/workspaces`
- Container Apps Environment `cae-xhq7rqjkxre3u` (54.8s) — `Microsoft.App/managedEnvironments`, `zoneRedundant: false` (required for westus)
- Container App `ca-grafana-xhq7rqjkxre3u` (1m15.1s) — `Microsoft.App/containerApps`, running status: **Running**

Configuration highlights:

- Image: `docker.io/grafana/grafana:11.3.0` (pinned)
- Port 3000, external ingress, HTTPS
- Database: SQLite (embedded default — no external DB)
- Health probes on `/api/health` (Liveness `initialDelaySeconds:15`; Startup `failureThreshold:10`, `periodSeconds:30` = 5-min AVM-compatible window; Readiness `periodSeconds:10`)
- Scale: `minReplicas:1` (kept warm for reliable verification), `maxReplicas:3`, HTTP scale rule (10 concurrent)
- Admin user `admin`; admin password is a 24-char cryptographically-random alphanumeric secret generated with Node `crypto.randomBytes`, stored only in the azd env (`GRAFANA_ADMIN_PASSWORD`) and injected as a Container App secret. Never printed or committed.

## Production Verification (live requests)

Live URL: `https://ca-grafana-xhq7rqjkxre3u.agreeableocean-ce36137b.westus.azurecontainerapps.io`

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| `/api/health` status | HTTP 200 | 200 | PASS |
| `/api/health` body | `database:"ok"` | `{"database":"ok","version":"11.3.0",...}` | PASS |
| Root `/` | reachable / HTTP 200 | 302 → `/login` → 200 | PASS |
| Authenticated `/api/org` | HTTP 200 | 200, org `"Main Org."` (Basic auth, credentials not printed) | PASS |

## Screenshot

`screenshot-grafana.png` — Grafana "Welcome to Grafana" login page (v11.3.0), captured with Playwright bundled Chromium (not branded Chrome). Browser resource-failure inspection: **no failed document/script/xhr/fetch/image requests**.

## Cleanup Policy

Final policy: **delete after successful verification**. `rg-rr-grafana-0717` was deleted and `az group exists` returned `false`. No unrelated resources were modified or deleted.

## Notes / Deviations

- Used raw `Microsoft.App/*` and `Microsoft.OperationalInsights/*` Bicep resources rather than AVM modules. This is a sanctioned fallback (AGENTS.md: "A passing, teardown-safe journey beats an elegant module that can't deploy") and keeps the SQLite-only Grafana deployment lean with deterministic control over probes, `zoneRedundant:false`, and SCREAMING_SNAKE_CASE outputs. No ACR is needed (public Grafana image), so the two-phase managed-identity ACR pattern does not apply.
- `minReplicas:1` was chosen over scale-to-zero to avoid cold-start flakiness during verification, consistent with the deployer skill's CI/dev guidance.
- No new journey or runner defects were observed in this rerun, so `issues.md` was intentionally not created. (An earlier aborted attempt's `copilot-permission-failure.log` reflected a host approval-gate condition, not a defect in the journey content or runner skill; it is not reproduced here.)
