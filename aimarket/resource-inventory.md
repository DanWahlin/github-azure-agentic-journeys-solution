# AIMarket — Resource Inventory (rr-aimarket-0717)

**Subscription:** `[REDACTED]`
**Resource group:** `rg-rr-aimarket-0717` (location `westus`)
**azd env tag:** `azd-env-name=rr-aimarket-0717`
**Resource token:** `km5obuwjrop4u`

All resources below were created by this run and deleted at teardown. Nothing outside this
resource group was created or modified.

## Resources in rg-rr-aimarket-0717

| Name | Type | Location |
|------|------|----------|
| `crkm5obuwjrop4u` | Microsoft.ContainerRegistry/registries (Basic) | westus |
| `log-km5obuwjrop4u` | Microsoft.OperationalInsights/workspaces | westus |
| `appi-km5obuwjrop4u` | Microsoft.Insights/components | westus |
| `srch-km5obuwjrop4u` | Microsoft.Search/searchServices (Basic, semantic free) | westus |
| `ai-km5obuwjrop4u` | Microsoft.CognitiveServices/accounts (AIServices) | westus |
| `ai-km5obuwjrop4u/gpt-5-mini` | …/accounts/deployments (GlobalStandard, v2025-08-07) | westus |
| `cae-km5obuwjrop4u` | Microsoft.App/managedEnvironments (zoneRedundant: false) | westus |
| `ca-api-km5obuwjrop4u` | Microsoft.App/containerApps (azd-service-name=api) | westus |
| `ca-web-km5obuwjrop4u` | Microsoft.App/containerApps (azd-service-name=web) | westus |
| `Application Insights Smart Detection` | microsoft.insights/actiongroups (auto-created by App Insights) | global |
| `Failure Anomalies - appi-km5obuwjrop4u` | microsoft.alertsmanagement/smartDetectorAlertRules (auto) | global |

The last two are auto-created by Application Insights and are removed with the resource group.

## Role assignments (managed identities)

| Assignee (system identity) | Role | Scope |
|----------------------------|------|-------|
| `ca-api-km5obuwjrop4u` | AcrPull (`7f951dda-4ed3-4680-a7ca-43fe172d538d`) | ACR `crkm5obuwjrop4u` |
| `ca-web-km5obuwjrop4u` | AcrPull | ACR `crkm5obuwjrop4u` |
| `ca-api-km5obuwjrop4u` | Cognitive Services User (`a97b65f3-24c7-4388-baec-2e87135dc908`) | AI Services `ai-km5obuwjrop4u` |

Role assignments live inside the resource group scopes (ACR / AI Services) and are deleted with them.

## Container images (in ACR, deleted with the registry)

| Repository:tag | Built by | Platform |
|----------------|----------|----------|
| `aimarket-api:azd-*` | azd remoteBuild (ACR) | linux/amd64 |
| `aimarket-web:postdeploy-*` | postdeploy hook (`docker buildx --push`) | linux/amd64 |

## Soft-delete note

`ai-km5obuwjrop4u` (Cognitive Services) is soft-deletable. Teardown used `azd down --force --purge`
to purge it, and cleanup verification checked `az cognitiveservices account list-deleted` for the name.
