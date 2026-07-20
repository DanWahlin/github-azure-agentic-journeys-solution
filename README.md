# GitHub and Azure Agentic Journeys: Verified Solutions

This repository contains runnable solutions for the five journeys in [github-azure-agentic-journeys](https://github.com/DanWahlin/github-azure-agentic-journeys). Use a solution to compare your work or deploy the completed application.

> [!CAUTION]
> Azure resources cost money. Each runbook includes cleanup steps. The URLs and resource names in the reports are historical. The original test resources were deleted.

## Requirements

Install these tools on Windows, macOS, or Linux:

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI (`azd`)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) 1.28.0 or later
- [Node.js](https://nodejs.org/en/download) 24 LTS or later

Run these checks:

```text
az version
azd version
node --version
az login
az account show --output table
azd config set auth.useAzCliAuth true
```

## Run a solution

Clone the repository, then open the runbook for one solution.

```text
git clone https://github.com/DanWahlin/github-azure-agentic-journeys-solution.git
cd github-azure-agentic-journeys-solution
```

| Solution | Azure services | Additional host tools | Runbook |
| --- | --- | --- | --- |
| Grafana | Container Apps, Log Analytics | None | [Run Grafana](./grafana/README.md) |
| n8n | Container Apps, PostgreSQL | npm dependencies for browser verification | [Run n8n](./n8n/README.md) |
| Superset | AKS, PostgreSQL, Load Balancer | None | [Run Superset](./superset/README.md) |
| AIMarket | Container Apps, ACR, AI Search, Foundry | None | [Run AIMarket](./aimarket/README.md) |
| SmartTodo | Azure Functions, Azure SQL, Foundry | Functions Core Tools v4, Go-based `sqlcmd` | [Run SmartTodo](./smart-todo/README.md) |

The runbooks list the environment values, deployment command, verifier, and cleanup check for each solution.

## Check the application code

Use these component guides when you want to build or test the application without deploying it:

- [AIMarket API and client](./aimarket/README.md#check-the-code)
- [SmartTodo API and iOS contract](./smart-todo/README.md#check-the-code)

## Previous run results

All five solutions were deployed and checked against live Azure resources. Those resources were then deleted. See:

- [`PREDICTABILITY-REPORT.md`](./PREDICTABILITY-REPORT.md)
- [`run-manifest.json`](./run-manifest.json)
- Each solution's `run-report.md`

Local Azure state, credentials, logs, databases, and private keys are excluded from Git. Do not commit values stored in an `azd` environment.

## License

[MIT](./LICENSE)
