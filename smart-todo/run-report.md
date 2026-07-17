# SmartTodo — Phase 3 Run Report (Deploy & Verify)

**Result:** SUCCESS. The API deployed to Azure Functions Flex Consumption and the
complete live lifecycle passed (23/23 checks, including AI step generation).

## Environment

| Item | Value |
|------|-------|
| Journey | SmartTodo (Phase 3 of 3) |
| Stack | Node.js 24 + TypeScript, Azure Functions v4 |
| Host | Linux aarch64 (ARM64) |
| Source commit | `0382099` |
| Workspace | `smart-todo/` (this folder only) |
| Subscription | `[REDACTED]` |
| Location | `westus` |
| azd environment | `rr-smarttodo-0717` |
| Resource group | `rg-rr-smarttodo-0717` |
| Cleanup policy | **delete after successful verification** |

### Tool versions

| Tool | Version |
|------|---------|
| node | v24.13.0 |
| az | 2.88.0 |
| azd | 1.28.0 |
| sqlcmd (Go) | v1.10.0 |
| func | 4.12.1 |

## Infrastructure generated (`infra/`, `azure.yaml`)

Raw `Microsoft.*` Bicep was used throughout for deterministic control over the
documented Flex Consumption, Storage, Azure SQL, and zone-redundancy gotchas.
This is explicitly permitted by AGENTS.md when AVM parameter drift would risk a
CI deployment. A passing, teardown-safe deployment was prioritized over module
elegance.

- `infra/main.bicep` — subscription scope: creates the resource group and calls
  `resources.bicep` at resource-group scope (scope split per conventions).
- `infra/resources.bicep` — Log Analytics + Application Insights, Storage
  (StorageV2, `networkAcls.defaultAction: Allow`, pre-created `deploymentpackage`
  container), Microsoft Foundry (AIServices `S0`) + `gpt-5-mini` `2025-08-07`
  GlobalStandard deployment, Azure SQL Server (Entra-only admin = deploying user)
  + Basic database (`maxSizeBytes: 2147483648`, `zoneRedundant: false`) + Allow
  Azure Services firewall rule, Flex Consumption plan (`FC1`) + Function App
  (system-assigned identity, `instanceMemoryMB: 2048`, Node 24 runtime,
  identity-based `AzureWebJobsStorage__accountName`, no `FUNCTIONS_WORKER_RUNTIME`),
  role assignments (Function identity → Storage Blob Data Owner; deploying user →
  Storage Blob Data Contributor).
- `infra/main.parameters.json` — azd-populated params (`AZURE_ENV_NAME`,
  `AZURE_LOCATION`, `AZURE_PRINCIPAL_ID`, `AZURE_PRINCIPAL_LOGIN`,
  `AZURE_PRINCIPAL_TYPE`, `AZURE_RESOURCE_GROUP`).
- `infra/abbreviations.json` — naming abbreviations.
- `infra/hooks/postprovision.js` — CommonJS hook (see below).
- `infra/hooks/postprovision-schema.sql` — idempotent schema + seed.
- `azure.yaml` — single `api` function service (`language: ts`), bicep infra,
  cross-platform `postprovision` hook (`posix`/`windows`, runs `node ./infra/hooks/postprovision.js`).

### Deployment outputs (SCREAMING_SNAKE_CASE)

| Output | Value |
|--------|-------|
| API_URL | `https://func-id62b5c2lfhta.azurewebsites.net` |
| FUNCTION_APP_NAME | `func-id62b5c2lfhta` |
| SQL_SERVER_NAME | `sql-id62b5c2lfhta` |
| SQL_DATABASE_NAME | `smarttodo` |
| AZURE_AI_ENDPOINT | `https://aif-id62b5c2lfhta.cognitiveservices.azure.com/` |
| AZURE_AI_DEPLOYMENT | `gpt-5-mini` |
| RESOURCE_GROUP_NAME | `rg-rr-smarttodo-0717` |

The AI API key is delivered only as a Function App setting and is intentionally
**not** an azd output. No tokens, passwords, or connection strings appear in any
report, log, or committed file.

## Post-provision hook behavior

`infra/hooks/postprovision.js` uses `execFileSync` argument arrays (`shell:false`)
exclusively — no shell interpolation, traps, command substitution, `curl`, or
`grep`. It:

1. Preflights `az`, `azd`, `node`, and `sqlcmd`; aborts before any Azure change if
   one is missing.
2. Reads `SQL_SERVER_NAME`, `SQL_DATABASE_NAME`, `FUNCTION_APP_NAME`,
   `RESOURCE_GROUP_NAME` via `azd env get-value`.
3. Normalizes the SQL server to short name + `<name>.database.windows.net` FQDN.
4. Reads the current SQL connection policy; switches Redirect → Proxy only when
   required (this run's policy was not Redirect, so no change was made).
5. Looks up the developer public IP over HTTPS and creates a uniquely named
   temporary firewall rule, cleaned up in `finally`.
6. Creates the Function managed-identity SQL user (escaped identifier/literal) and
   grants `db_datareader`, `db_datawriter`, `db_ddladmin` via
   `sqlcmd --authentication-method ActiveDirectoryAzCli`.
7. Applies `postprovision-schema.sql` (idempotent schema + seed).
8. Restores the firewall rule and original connection policy in `finally`.

The hook ran automatically during `azd up` (confirmed by the temporary firewall
rules it created) and prints `Post-provision SQL setup complete.`

## Phase results

| Check | Command | Result |
|-------|---------|--------|
| API build | `npm run build` (tsc, strict) | PASS (0 errors) |
| API tests | `npm test` (node:test) | PASS (44/44) |
| Swift contract check | `node scripts/contract-check.mjs` | PASS |
| Swift static check | `node scripts/swift-static-check.mjs` | PASS |
| Bicep validation | `az bicep build --file infra/main.bicep` | PASS |
| Hook syntax | `node --check infra/hooks/postprovision.js` | PASS |
| Provision + deploy | `azd up` | PASS (~5 min) |
| Function running | `az functionapp function list` | PASS (6 functions registered) |
| Live lifecycle | `node scripts/verify-api.mjs` (AI enabled) | PASS (23/23) |

### Live lifecycle detail (23/23, against the deployed API)

- Seed read for `user-1`: `todo-1`, `todo-2`, `todo-3` present; `todo-2` has 4 steps.
- Missing `userId` → 400 `VALIDATION_ERROR`.
- Create → 201, status `pending`, `stepsGenerated: false`, empty steps.
- Empty title → 400 `{ error: { code, message } }`.
- Status update → 200 `in_progress`; invalid status → 400.
- Generate steps → 200 with 3–7 steps, `stepsGenerated: true`, sequential order.
- Complete a step → 200; non-boolean → 400; completing all → todo auto-completes.
- Delete → 204 (no body); delete missing → 404; deleted todo + cascaded steps absent.
- Temporary verification todo removed in the verifier's `finally` block; post-run
  probe of the temp user returned `[]` and the `user-1` seed remained intact.

## Config.swift

`src/ios/SmartTodo/Config.swift` `apiBaseURL` updated to the deployed URL
`https://func-id62b5c2lfhta.azurewebsites.net`. The Swift static check still passes.
(No Xcode/iOS build — Linux host has no Swift/iOS SDK; verification is static +
contract-based, unchanged from Phase 2.)

## Repairs made during the run

- **Hook firewall cleanup bug:** `az sql server firewall-rule delete` does not
  accept `--yes`. The generated hook was corrected to drop that flag, and the two
  temporary firewall rules that leaked before the fix were deleted manually. Only
  the intended `AllowAllWindowsAzureIps` rule remains on the server.

No journey/documentation defect was found, so no `issues.md` was created. The one
issue above was an implementation bug in generated code, fixed in place.

## Cleanup

After the journey-specific and shared verifiers passed, `rg-rr-smarttodo-0717` was deleted and `az group exists` returned `false`. See `resource-inventory.md` for the pre-deletion owned resource inventory. No unrelated resources or resource groups were touched.
