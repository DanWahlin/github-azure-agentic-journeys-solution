# SmartTodo Predictability Issues

## Clean non-interactive `azd up` omitted the required Entra principal login

**Status:** Resolved and verified from a brand-new environment; source guidance backport pending.

A fresh environment had the subscription, location, principal object ID, and SQL password configured. `azd up --no-prompt` stopped before creating resources because `AZURE_PRINCIPAL_LOGIN` was missing.

The generated parameter contract requires all three values:

- `AZURE_PRINCIPAL_ID`
- `AZURE_PRINCIPAL_LOGIN`
- `AZURE_PRINCIPAL_TYPE`

A predictable preflight must resolve and persist the complete group before provisioning, with separate user and service-principal handling.

## Foundry model deployment raced the parent account

**Status:** Resolved and verified from a brand-new environment.

The original flat resource deployment failed with `RequestConflict` because the model child operation reached the Foundry account while its provisioning state was non-terminal.

The repaired Bicep places the model child in `infra/ai-model-deployment.bicep` and passes the created account name into that nested deployment. A brand-new deployment successfully created the account, model, Function App, SQL database, and complete live API lifecycle.

## Generated SQL firewall-rule name contained a reserved word

**Status:** Resolved and verified from a brand-new environment.

`azd` validation flagged `AllowAllWindowsAzureIps` because it contains the reserved word `WINDOWS`. The rule is now named `AllowAzureServices` while retaining the required `0.0.0.0` start/end addresses. The fixed deployment validated without the warning and created the rule successfully.
