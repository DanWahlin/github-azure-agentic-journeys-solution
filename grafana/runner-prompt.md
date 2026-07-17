Run the Grafana journey end-to-end in this folder as the journey-runner would.

Read before acting:
- JOURNEY.md
- ../.github/skills/journey-runner/SKILL.md
- ../.github/agents/oss-to-azure-deployer.agent.md
- ../.github/skills/grafana-azure/SKILL.md and its linked config/troubleshooting files
- ../.github/skills/container-apps-deployment/SKILL.md
- ../AGENTS.md

Execution contract:
1. Work only inside this grafana folder. Keep JOURNEY.md as source context and place all generated infrastructure, hooks, scripts, reports, logs, and screenshots here.
2. Host is Linux ARM64. Use only cross-platform CommonJS .js or .ts hooks and argument arrays. Use bundled Playwright Chromium, never branded Chrome.
3. Use Azure subscription [REDACTED], location westus, azd environment rr-grafana-0717, and resource group rg-rr-grafana-0717. Configure azd to reuse Azure CLI auth.
4. Generate Grafana infrastructure from scratch using Bicep and azd. Generate a secure admin password without printing it. Use /api/health probes and an AVM-compatible startup window.
5. Validate Bicep and azure.yaml before deployment, then run azd up. Repair real failures using evidence and retry until successful.
6. Verify the live root returns HTTP 200 and /api/health returns JSON with database=ok. Verify authenticated API access without printing credentials. Capture screenshot-grafana.png with bundled Chromium and inspect browser resource failures.
7. Save sanitized run-report.md with actual commands/results, environment and owned resource group, URL, and resource inventory. Create issues.md only if this rerun exposes a genuinely new journey or runner defect; do not recreate historical/resolved issues.
8. After every verification passes, delete only the exact owned resource group above and confirm it no longer exists. Never delete or modify unrelated resources.

Do the work now. Do not stop at a plan or plausible output.