# GitHub and Azure Agentic Journeys: Verified Solution

This repository contains the generated solution for all five journeys from [DanWahlin/github-azure-agentic-journeys](https://github.com/DanWahlin/github-azure-agentic-journeys). Each journey was generated in isolation, built, tested, deployed to Azure, verified against the live deployment, and then torn down.

> All Azure resource groups created by this run were deleted after verification. URLs and resource names in the reports are historical evidence, not active services.

## Results

| Journey | Generated solution | Verification evidence |
|---|---|---|
| [Grafana](./grafana/) | Bicep, `azd`, Container Apps configuration, hooks, and browser automation | [Run report](./grafana/run-report.md) · [Screenshot](./grafana/screenshot-grafana.png) |
| [n8n](./n8n/) | Pinned n8n 2.30.6 deployment with PostgreSQL, health probes, and owner onboarding | [Run report](./n8n/run-report.md) · [Screenshot](./n8n/screenshot-n8n.png) · [Issues](./n8n/issues.md) |
| [Superset](./superset/) | AKS, PostgreSQL, Helm/Kubernetes configuration, and browser login verification | [Run report](./superset/run-report.md) · [Screenshot](./superset/screenshot-superset.png) · [Issues](./superset/issues.md) |
| [AIMarket](./aimarket/) | Node.js API, React client, SQLite, Azure AI Search, Foundry chat, Container Apps, and ACR | [Run report](./aimarket/run-report.md) · [Screenshot](./aimarket/screenshot-aimarket.png) |
| [SmartTodo](./smart-todo/) | Azure Functions API, Azure SQL, Foundry-generated steps, and SwiftUI client | [Run report](./smart-todo/run-report.md) · [Issues](./smart-todo/issues.md) |

The machine-readable summary is in [`run-manifest.json`](./run-manifest.json). A second clean-environment deployment pass and its proven repairs are documented in [`PREDICTABILITY-REPORT.md`](./PREDICTABILITY-REPORT.md).

## Repository layout

```text
.github/          Agents, reusable skills, portable runners, and verification scripts
grafana/          Generated Grafana infrastructure and evidence
n8n/              Generated n8n infrastructure and evidence
superset/         Generated Superset infrastructure and evidence
aimarket/         Generated full-stack marketplace, infrastructure, tests, and evidence
smart-todo/       Generated Functions API, SwiftUI client, infrastructure, tests, and evidence
docs/             Cross-platform tool installation guidance
SOURCE-README.md  README from the source journeys repository
```

## Local validation

Prerequisites and Windows, macOS, and Linux installation options are documented in [`docs/tool-installation.md`](./docs/tool-installation.md).

### AIMarket

```bash
cd aimarket/api
npm ci
npm run build
npm test

cd ../client
npm ci
npm run build
npm test
```

### SmartTodo API and Swift contract

```bash
cd smart-todo/src/api
npm ci
npm run build
npm test

cd ../ios
node scripts/contract-check.mjs
node scripts/swift-static-check.mjs
```

The SwiftUI source and API contract were validated on Linux ARM64. Building or running the iOS app requires macOS with Xcode.

## Deployment

Each journey contains its own `azure.yaml`, Bicep, hooks, prompts, and run report. Use a new `azd` environment and your own Azure subscription rather than the historical environment names in the reports.

Before deploying, authenticate and let `azd` reuse Azure CLI authentication:

```text
az login
az account show
azd config set auth.useAzCliAuth true
```

Azure resources cost money. Tear down a journey as soon as verification is complete:

```text
azd down --force --purge
```

## Security and publication hygiene

- Azure Developer CLI state under `.azure/`, environment files, logs, local databases, private keys, and package-manager credentials are excluded by `.gitignore`.
- The Azure subscription identifier was redacted from publishable reports and prompts.
- Git history and the exact publishable tree were scanned with Gitleaks before publication.
- No credentials, API keys, passwords, tokens, connection strings, or private keys are committed.

## Notes

- The solutions were generated and live-tested on Linux ARM64.
- Host-facing scripts use Node.js and argument arrays for Windows, macOS, and Linux portability.
- Playwright uses bundled Chromium rather than assuming branded Chrome is available.
- `SOURCE-README.md` preserves the original journey overview. The generated folders in this repository are the completed solutions.

## License

This repository retains the source project's [MIT License](./LICENSE).
