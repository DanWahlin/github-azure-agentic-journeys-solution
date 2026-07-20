# Run the Grafana solution

Deploy Grafana to Azure Container Apps.

Run all commands from the `grafana` directory.

## Deploy

```text
cd grafana
az account show --query id --output tsv
azd env new grafana-dev
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION westus
azd env set GRAFANA_ADMIN_PASSWORD <strong-password>
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
azd up
```

Copy the subscription ID returned by `az account show`. Store the password only in the selected `azd` environment. `azd up` must exit with code 0.

## Verify

```text
node scripts/verify-grafana.mjs
```

The verifier checks Grafana health and authenticated API access. It does not print the password.

Open the URL from this command:

```text
azd env get-value GRAFANA_URL
```

Sign in as `admin` with the password that you stored before deployment.

## Remove the deployment

This procedure permanently deletes the deployment.

```text
azd env get-value RESOURCE_GROUP_NAME
azd down --force --purge
az group exists --name <resource-group-name>
```

Copy the resource group name before deletion. The final command must return `false`.

See [run-report.md](./run-report.md) for the previous run results.
