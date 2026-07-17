# n8n on Azure — Journey Run Report

**Status:** ✅ PASS — deployed, verified, and deleted after verification.

## Environment

| Item | Value |
|------|-------|
| Journey | n8n on Azure Container Apps (`n8n/JOURNEY.md`) |
| Stack | Azure Container Apps + PostgreSQL Flexible Server (Bicep + azd) |
| Host OS / arch | Linux / aarch64 (ARM64) |
| Node.js | v24.13.0 |
| Azure CLI | 2.88.0 |
| azd | 1.28.0 |
| Playwright | ^1.49 (bundled Chromium) |
| Source commit | `0382099` |
| Workspace | `n8n/` (this folder) |
| Subscription | `[REDACTED]` (Visual Studio Enterprise Subscription) |
| Location | `westus` |
| azd environment | `rr-n8n-0717` |
| Owned resource group | `rg-rr-n8n-0717` |
| Cleanup policy | **delete after successful verification** |

## Deployed URL

```
N8N_URL=https://ca-n8n-l5mksrruk3b6s.jollybush-2d6aa002.westus.azurecontainerapps.io
```

## Resource Inventory (`rg-rr-n8n-0717`)

| Resource | Name | Type / SKU |
|----------|------|------------|
| Container App | `ca-n8n-l5mksrruk3b6s` | `Microsoft.App/containerApps` — image `docker.io/n8nio/n8n:2.30.6`, 1.0 vCPU / 2Gi, min/max replicas 1/3 |
| Container Apps Environment | `cae-l5mksrruk3b6s` | `Microsoft.App/managedEnvironments` — `zoneRedundant: false` |
| PostgreSQL Flexible Server | `psql-l5mksrruk3b6s` | `Microsoft.DBforPostgreSQL/flexibleServers` — v16, Standard_B1ms / Burstable, 32 GB |
| Log Analytics Workspace | `log-l5mksrruk3b6s` | `Microsoft.OperationalInsights/workspaces` — PerGB2018, 30-day retention |
| User-Assigned Managed Identity | `id-l5mksrruk3b6s` | `Microsoft.ManagedIdentity/userAssignedIdentities` |

## Generated Artifacts (in `n8n/`)

```
azure.yaml                              # infra-only azd project + postprovision hook
infra-n8n/main.bicep                    # subscription scope: RG + resources module
infra-n8n/resources.bicep               # RG scope: LA, CAE, identity, Postgres, Container App
infra-n8n/main.parameters.json          # ${AZURE_ENV_NAME}, ${AZURE_LOCATION}, ${POSTGRES_PASSWORD}, ${N8N_ENCRYPTION_KEY}
infra-n8n/abbreviations.json
infra-n8n/hooks/postprovision.js        # cross-platform WEBHOOK_URL hook (execFileSync, arg arrays)
scripts/verify-n8n.mjs                  # portable verifier (azd + az + Playwright)
scripts/capture-screenshot.mjs          # bundled-Chromium screenshot + resource-error scan
scripts/package.json
screenshot-n8n.png                      # owner-setup page
```

## Phase Results

| Phase | Command(s) | Result |
|-------|-----------|--------|
| Preflight | tool version checks, `az account show`, provider status | PASS — Node 24.13.0, az 2.88.0, azd 1.28.0; `Microsoft.App`, `Microsoft.DBforPostgreSQL`, `Microsoft.OperationalInsights` all Registered |
| Generate infra | authored Bicep, azure.yaml, hook | PASS |
| Validate | `az bicep build --file infra-n8n/main.bicep` | PASS (only BCP334 name-length warnings) |
| Validate | `azd provision --preview --no-prompt` | PASS — 5 resources planned, RG `rg-rr-n8n-0717` |
| Deploy | `azd up --no-prompt` | Provision PASS (RG 3.6s, LA 24.6s, CAE 53.5s, Postgres 4m5s, Container App 19.9s). Postprovision hook initially FAILED — see Issue 1. |
| Repair | renamed hook `.mjs`→`.js` (CommonJS), updated `azure.yaml` | PASS |
| Hook | `azd hooks run postprovision` | PASS — `WEBHOOK_URL` set on container |
| Verify | `node scripts/verify-n8n.mjs` | PASS — 7/7 checks |
| Screenshot | `node scripts/capture-screenshot.mjs --fail-on-resource-errors true` | PASS — no resource failures; owner-setup rendered |

## Production Verification (`scripts/verify-n8n.mjs`, 7/7 PASS)

| Check | Result |
|-------|--------|
| Container App provisioning state | `Succeeded` |
| Active revision running state | `Running` |
| `WEBHOOK_URL` configured | equals `N8N_URL` |
| `/healthz` returns HTTP 200 | PASS |
| UI root returns HTTP 200 | PASS |
| Page title contains n8n | `n8n.io - Workflow Automation` |
| Owner-setup or login page renders | `owner-setup` |

Manual confirmations:
- `curl $N8N_URL/healthz` → `200`
- `curl $N8N_URL/` → `200`
- Screenshot shows the **Set up owner account** form (email, first/last name, password, Next) with the n8n logo and no broken assets.

### Browser resource failures

None. The n8n SPA issues an intentional `GET /rest/login` that returns HTTP 401 on a
fresh instance (no session yet) before rendering the owner-setup screen. This is
expected n8n auth-probe behavior, not a broken resource, and is classified as benign
by the screenshot helper.

## Key Configuration Applied

- Image pinned: `docker.io/n8nio/n8n:2.30.6` (never `latest`).
- Secrets generated with Node `crypto.randomBytes()`, stored as Container App secrets
  (`postgres-password`, `n8n-encryption-key`) and referenced via `secretRef`. Values
  never printed or committed. Pinned in the azd environment for stable redeploys.
- PostgreSQL: SSL enabled, `DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED=false`,
  `DB_POSTGRESDB_CONNECTION_TIMEOUT=60000`, FQDN host, "Allow Azure services" firewall rule.
- Health probes on `/healthz` (port 5678): startup `failureThreshold: 10` ×
  `periodSeconds: 30` (5-min window), liveness `initialDelaySeconds: 60`, readiness 10s.
- `minReplicas: 1` for deterministic CI verification.
- No `N8N_BASIC_AUTH_*` variables (removed by current n8n; built-in owner-account flow used).
- `WEBHOOK_URL` set post-provision via cross-platform `.js` hook (execFileSync + arg arrays).
- `zoneRedundant: false` on the Container Apps Environment (required for westus).

## Cleanup Policy

Final policy: **delete after successful verification**. `rg-rr-n8n-0717` was deleted and `az group exists` returned `false`. No unrelated resources were modified or deleted.

## Remaining Blockers / Limitations

None blocking. One journey documentation defect was found and worked around; see
[`issues.md`](./issues.md).
