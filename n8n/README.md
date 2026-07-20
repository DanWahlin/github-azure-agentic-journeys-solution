# Run the n8n solution

Deploy n8n and PostgreSQL to Azure Container Apps.

Run all commands from the `n8n` directory.

## Deploy

```text
cd n8n
az account show --query id --output tsv
azd env new n8n-dev
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION westus
azd env set POSTGRES_PASSWORD <strong-password>
azd env set N8N_ENCRYPTION_KEY <long-random-value>
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.DBforPostgreSQL
az provider register --namespace Microsoft.OperationalInsights
azd up
```

Copy the subscription ID returned by `az account show`. Store both secret values only in the selected `azd` environment. `azd up` must exit after the replacement Container App revision is ready.

## Verify

Install Chromium before the first verifier run:

```text
npm ci --prefix scripts
npm exec --prefix scripts -- playwright install chromium
node scripts/verify-n8n.mjs
```

On Linux, install the required Playwright system packages if Chromium reports a missing library. See [Playwright system requirements](https://playwright.dev/docs/intro#system-requirements).

The verifier checks `/healthz`, the active revision, and the rendered owner-setup or sign-in page.

Open the URL from this command:

```text
azd env get-value N8N_URL
```

## Remove the deployment

This procedure permanently deletes n8n and its PostgreSQL data.

```text
azd env get-value RESOURCE_GROUP_NAME
azd down --force --purge
az group exists --name <resource-group-name>
```

Copy the resource group name before deletion. The final command must return `false`.

See [run-report.md](./run-report.md) for the previous run results and [issues.md](./issues.md) for fixes made during that run.
