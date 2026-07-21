Run the Apache Superset journey end-to-end in this folder as the journey-runner would.

Read JOURNEY.md, ../.github/skills/journey-runner/SKILL.md, ../.github/agents/oss-to-azure-deployer.agent.md, every file under ../.github/skills/superset-azure/, and ../AGENTS.md before acting.

Work only inside this superset folder. Generate all infrastructure, manifests, hooks, reports, logs, and screenshots here. Host is Linux ARM64; only Node.js, Azure CLI, and Azure Developer CLI are required host tools. Use only portable CommonJS .js or .ts host hooks and argument arrays.

Deploy with subscription [REDACTED], location westus, azd environment rr-superset-0717, and resource group rg-rr-superset-0717. Use AKS, not Container Apps. Generate secure credentials without printing them. Generate infra-superset/hooks/postprovision.js to attach a private manifest bundle to `az aks command invoke`, run Helm 3 and kubectl inside Azure, apply manifests, and poll the LoadBalancer. Configure the AKS pool for a region without availability zones, use PostgreSQL rather than SQLite, and implement the shared emptyDir psycopg2 pattern.

Validate Bicep, azure.yaml, and Kubernetes manifests before azd up. Repair evidence-backed failures and retry until deployment succeeds. Verify every Superset pod is Ready 1/1, init/main logs prove PostgresqlImpl with no SQLite fallback, /health returns HTTP 200, and browser login succeeds using #username, #password, and input[type="submit"], button[type="submit"], reaching /superset/welcome/. Capture screenshot-superset.png using bundled Chromium without printing credentials.

Write sanitized run-report.md with actual results and owned resource inventory. Create issues.md only for a genuinely new defect found during this rerun. After every verification passes, delete only this exact owned resource group and confirm its AKS-managed resource group is also gone. Never touch unrelated resources. Do the work now, not just a plan.