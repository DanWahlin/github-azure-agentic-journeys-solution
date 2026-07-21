# Predictability Deployment Report

- **Date:** 2026-07-17
- **Repository commit tested:** `b3b99ed2f51c502a75700e7bb46c5f4f075602ec` plus the repairs documented below
- **Host:** Linux ARM64
- **Deployment method:** fresh Azure Developer CLI environments using each journey's checked-in `azure.yaml` and Bicep

## Result

All five journeys deployed, passed their live acceptance checks, and were deleted. After repairing n8n, Superset, and SmartTodo, each repaired solution also passed a separate deployment from a brand-new `azd` environment. No run-owned resource group, AKS-managed resource group, or soft-deleted Foundry account remained after cleanup.

| Journey | Final result | Live verification |
|---|---|---|
| Grafana | Passed on first deployment | Container App Running, pinned Grafana 11.3.0 image, `/api/health` database OK, authenticated API, clean browser load |
| n8n | Passed after readiness repair | Pinned n8n 2.30.6 image, PostgreSQL Ready, `/healthz` and editor HTTP 200, `WEBHOOK_URL` correct, clean owner-setup browser load |
| Superset | Passed after clean-environment secret repair | AKS pod Ready, PostgreSQL confirmed with no SQLite fallback, `/health` HTTP 200, authenticated `/superset/welcome/` browser flow |
| SmartTodo | Passed after principal-input and Bicep repairs | 44 API tests, Swift contract/static checks, Function App Running, SQL Online, Foundry model Succeeded, complete seed/create/AI/update/fetch/delete lifecycle |
| AIMarket | Passed on first deployment | 52 API tests, 31 client tests, remote ACR builds, managed-identity image pulls, Search, chat, ten products/images, production API injection, clean browser load, live order creation |

## Repairs proven during this run

### n8n

- `postprovision.js` now waits until both `/healthz` and the editor root return HTTP 200 for six consecutive probes over 30 seconds after the `WEBHOOK_URL` revision update.
- The Bicep module's `resourceToken` declares its known 13-character length, eliminating false `BCP334` warnings.

The original single-success readiness check could return while Azure was still deprovisioning and occasionally routing to the old revision. A second brand-new n8n environment proved the sustained-readiness hook: `azd up` returned only after the intermittent 404 stopped, and immediate HTTP, metadata, and Playwright checks passed.

### Superset

- `postprovision.js` now generates and persists missing `SUPERSET_SECRET_KEY` and `SUPERSET_ADMIN_PASSWORD` values securely.
- Existing values are reused on reruns, and values are never printed.

The repaired hook completed Helm installation, Kubernetes secret creation, rollout, ingress discovery, PostgreSQL verification, and authenticated browser login from a brand-new Superset environment with neither secret preconfigured.

### SmartTodo

- Clean-environment setup must provide `AZURE_PRINCIPAL_ID`, `AZURE_PRINCIPAL_LOGIN`, and `AZURE_PRINCIPAL_TYPE` before non-interactive provisioning.
- Foundry model creation now runs in a nested Bicep deployment after the parent account instead of racing it in one flat resource deployment.
- The Azure SQL firewall rule is named `AllowAzureServices`, avoiding the reserved word `WINDOWS`.

The repaired Bicep compiled without journey warnings and passed a brand-new SmartTodo deployment. The Function App ran HTTPS-only, the serialized Foundry model deployment reached `Succeeded`, and the complete SQL-backed API lifecycle passed, including AI-generated action steps.

## Fresh repaired-run proof

| Journey | Fresh environment proof |
|---|---|
| n8n | New environment and resource group, sustained replacement-revision readiness, immediate `/healthz` and editor HTTP 200, pinned image and `WEBHOOK_URL` metadata, Playwright with no failed resources |
| Superset | New environment with absent Superset secrets, hook-generated values, AKS pod Ready, PostgreSQL confirmed, `/health` HTTP 200, authenticated `/superset/welcome/` browser flow |
| SmartTodo | New environment with explicit Entra principal contract, serialized Foundry model deployment `Succeeded`, Function App Running, full seed/create/AI/update/fetch/delete lifecycle |

## Source-repository backports

Required source guidance updates are tracked at these source-repository paths in the original `github-azure-agentic-journeys` working tree:

- `PREDICTABILITY-BACKPORTS.md`
- `journeys/n8n/issues.md`
- `journeys/superset/issues.md`
- `journeys/smart-todo/issues.md`

The ledger maps each proven repair to its journey README, PLAN, skill, runner, template, or agent file.

## Cleanup proof

The run-owned groups for the original five deployments and the separate repaired n8n, Superset, and SmartTodo runs all returned absent after `azd down --force --purge`. No AKS-managed group remained, and every run-created SmartTodo or AIMarket Foundry account returned zero soft-deleted matches.

## Platform note

The live deployment pass ran on Linux ARM64. Remote ACR builds produced Container Apps-compatible images. Swift source and contracts were statically validated; Xcode and iOS Simulator execution still require macOS.
