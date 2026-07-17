Run the n8n journey end-to-end in this folder as the journey-runner would.

Read before acting:
- JOURNEY.md
- ../.github/skills/journey-runner/SKILL.md
- ../.github/agents/oss-to-azure-deployer.agent.md
- ../.github/skills/n8n-azure/SKILL.md and its linked config/troubleshooting files
- ../.github/skills/container-apps-deployment/SKILL.md
- ../AGENTS.md

Execution contract:
1. Work only inside this n8n folder. Keep JOURNEY.md as source context and place all generated infrastructure, hooks, scripts, reports, logs, and screenshots here.
2. Host is Linux ARM64. Use cross-platform CommonJS .js or .ts hooks and argument arrays. Use bundled Playwright Chromium, never branded Chrome.
3. Use Azure subscription [REDACTED], location westus, azd environment rr-n8n-0717, and resource group rg-rr-n8n-0717. Configure azd to reuse Azure CLI auth.
4. Generate n8n infrastructure from scratch using Bicep and azd. Pin docker.io/n8nio/n8n:2.30.6, generate secure credentials without printing them, use PostgreSQL, set minReplicas=1, and use /healthz with the documented AVM-compatible startup window. Do not generate N8N_BASIC_AUTH_* variables. Generate infra-n8n/hooks/postprovision.js as CommonJS for WEBHOOK_URL when needed.
5. Validate Bicep and azure.yaml before deployment, then run azd up. Repair real failures using evidence and retry until successful.
6. Verify /healthz returns HTTP 200, the UI returns HTTP 200, title contains n8n, the owner-setup or login page renders, and WEBHOOK_URL is correctly configured. Capture screenshot-n8n.png with bundled Chromium and inspect browser resource failures.
7. Save sanitized run-report.md with actual commands/results, environment and owned resource group, URL, and resource inventory. Create issues.md only if this rerun exposes a genuinely new journey or runner defect; do not recreate historical/resolved issues.
8. After every verification passes, delete only the exact owned resource group above and confirm it no longer exists. Never delete or modify unrelated resources.

Do the work now. Do not stop at a plan or plausible output.