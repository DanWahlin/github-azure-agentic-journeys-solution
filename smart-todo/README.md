# Run the SmartTodo solution

Deploy the SmartTodo API with Azure Functions, Azure SQL, and Microsoft Foundry. A SwiftUI client is included.

Install Node.js 24+, Azure Functions Core Tools v4, and the current Go-based `sqlcmd`. Xcode is required only to run the iOS client.

Run all deployment commands from the `smart-todo` directory.

## Deploy

Read the signed-in user's values:

```text
cd smart-todo
sqlcmd --version
func --version
az account show --query id --output tsv
az account show --query user.name --output tsv
az ad signed-in-user show --query id --output tsv
```

Create the environment with the returned values:

```text
azd env new smarttodo-dev
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION westus
azd env set AZURE_PRINCIPAL_LOGIN <account-login>
azd env set AZURE_PRINCIPAL_ID <principal-object-id>
azd env set AZURE_PRINCIPAL_TYPE User
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.Sql
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.CognitiveServices
az provider register --namespace Microsoft.OperationalInsights
azd up
```

The post-provision hook configures Azure SQL access and seed data. `azd up` must exit with code 0.

## Verify

```text
node ../.github/scripts/verify-smart-todo.mjs
```

The verifier checks seed data, create, AI step generation, update, fetch, and delete behavior.

## Check the code

```text
npm ci --prefix src/api
npm run build --prefix src/api
npm test --prefix src/api
node src/ios/scripts/contract-check.mjs
node src/ios/scripts/swift-static-check.mjs
```

To run the iOS client, open `src/ios/SmartTodo/SmartTodo.xcodeproj` on macOS. Set its API URL from `azd env get-value API_URL`.

## Remove the deployment

This procedure permanently deletes the Function App, Azure SQL database, Foundry resource, and application data.

```text
azd env get-value RESOURCE_GROUP_NAME
azd down --force --purge
az group exists --name <resource-group-name>
```

Copy the resource group name before deletion. The final command must return `false`.

See [run-report.md](./run-report.md) for the previous run results and [issues.md](./issues.md) for fixes made during that run.
