# Run the Superset solution

Deploy Apache Superset and PostgreSQL to Azure Kubernetes Service (AKS), with an NGINX ingress controller.

Install Node.js 24+. The post-provision hook runs Helm and `kubectl` inside Azure through AKS run command. The signed-in Azure identity must have permission to invoke AKS run commands.

Run all commands from the `superset` directory.

## Deploy

```text
cd superset
az vm list-usage --location westus --output table
az account show --query id --output tsv
azd env new superset-dev
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION westus
azd env set POSTGRES_PASSWORD <strong-password>
az provider register --namespace Microsoft.ContainerService
az provider register --namespace Microsoft.DBforPostgreSQL
az provider register --namespace Microsoft.OperationalInsights
azd up
```

Copy the subscription ID from the account command. Store the password only in the selected `azd` environment. The post-provision hook creates the remaining Superset secrets without printing them.

## Verify

```text
node scripts/verify-superset.mjs
```

The verifier checks the AKS pod, PostgreSQL usage, and the `/health` endpoint.

Open the URL from this command:

```text
azd env get-value SUPERSET_URL
```

Use username `admin`. Read the generated password only in a private terminal:

```text
azd env get-value SUPERSET_ADMIN_PASSWORD
```

## Remove the deployment

This procedure permanently deletes AKS, PostgreSQL, and all Superset data.

```text
azd env get-value AZURE_RESOURCE_GROUP
azd down --force --purge
az group exists --name <resource-group-name>
```

Copy the resource group name before deletion. The final command must return `false`.

See [run-report.md](./run-report.md) for the previous run results and [issues.md](./issues.md) for fixes made during that run.
