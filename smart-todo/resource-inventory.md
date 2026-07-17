# SmartTodo — Owned Resource Inventory

All resources created by this run (`azd up`, environment `rr-smarttodo-0717`).
Final state: **resource group deleted after successful verification**. The inventory below records what existed before deletion.

- **Subscription:** `[REDACTED]`
- **Resource group:** `rg-rr-smarttodo-0717` (westus)
- **azd env tag:** `azd-env-name=rr-smarttodo-0717`

| Resource | Name | Type |
|----------|------|------|
| Storage account | `stid62b5c2lfhta` | Microsoft.Storage/storageAccounts |
| Log Analytics workspace | `log-id62b5c2lfhta` | Microsoft.OperationalInsights/workspaces |
| Application Insights | `appi-id62b5c2lfhta` | Microsoft.Insights/components |
| AI Services (Foundry) | `aif-id62b5c2lfhta` | Microsoft.CognitiveServices/accounts |
| AI model deployment | `aif-id62b5c2lfhta/gpt-5-mini` | Microsoft.CognitiveServices/accounts/deployments |
| App Service plan (FC1) | `plan-id62b5c2lfhta` | Microsoft.Web/serverFarms |
| Function App | `func-id62b5c2lfhta` | Microsoft.Web/sites |
| SQL Server | `sql-id62b5c2lfhta` | Microsoft.Sql/servers |
| SQL Database | `sql-id62b5c2lfhta/smarttodo` | Microsoft.Sql/servers/databases |

Notes:
- `sql-id62b5c2lfhta/master` is the system database implicitly present on the
  server; it is not separately provisioned.
- The only SQL firewall rule remaining is `AllowAllWindowsAzureIps` (Bicep-defined,
  enables Azure services). All temporary post-provision rules were removed.

## Teardown (when desired)

```text
azd env select rr-smarttodo-0717
azd down --force --purge --no-prompt
```

`--purge` ensures the Cognitive Services (Foundry) account is purged from
soft-delete. No unrelated resource groups should be affected.
