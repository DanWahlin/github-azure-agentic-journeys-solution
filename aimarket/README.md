# Run the AIMarket solution

Deploy the AIMarket API and storefront with Azure Container Apps, Azure Container Registry, Azure AI Search, and Microsoft Foundry.

Install Node.js 24+. Azure Container Registry builds both application images in Azure.

Run all deployment commands from the `aimarket` directory.

## Deploy

```text
cd aimarket
az account show --query id --output tsv
azd env new aimarket-dev
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION westus
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.ContainerRegistry
az provider register --namespace Microsoft.CognitiveServices
az provider register --namespace Microsoft.Search
az provider register --namespace Microsoft.OperationalInsights
azd up
```

Copy the subscription ID from the account command. `azd up` must complete the API deployment and both hooks.

## Verify

```text
node ../.github/scripts/verify-aimarket.mjs
```

The verifier checks health, ten products and images, semantic search, chat, the storefront, and the deployed API configuration.

Open the URL from this command:

```text
azd env get-value WEB_URL
```

## Check the code

```text
npm ci --prefix api
npm run build --prefix api
npm test --prefix api
npm ci --prefix client
npm run build --prefix client
npm test --prefix client
```

## Remove the deployment

This procedure permanently deletes the application and its Azure resources.

```text
azd env get-value RESOURCE_GROUP_NAME
azd down --force --purge
az group exists --name <resource-group-name>
```

Copy the resource group name before deletion. The final command must return `false`.

See [run-report.md](./run-report.md) for the previous run results.
