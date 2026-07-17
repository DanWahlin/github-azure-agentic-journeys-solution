# n8n Journey — Issues Found During Run (`rr-n8n-0717`, 2026-07-17)

## Issue 1 (NEW): azd 1.28.0 rejects `.mjs` lifecycle-hook extension prescribed by the skills

**Severity:** Medium — breaks `azd up` at the `postprovision` step after a full (~5 min)
successful provision, unless the hook is renamed.

**Where the guidance says `.mjs`:**
- `.github/skills/n8n-azure/SKILL.md` → "Generate `infra-n8n/hooks/postprovision.mjs`"
- `.github/skills/n8n-azure/config/environment-variables.md` → "Generate `infra-n8n/hooks/postprovision.mjs`"
- `.github/skills/container-apps-deployment/SKILL.md` → `run: infra/hooks/postprovision.mjs`
- `.github/skills/journey-runner/SKILL.md` → "Generated `azd` lifecycle hooks must be `.mjs` or `.ts` files"

**What actually happens** with `azure.yaml`:
```yaml
hooks:
  postprovision:
    run: ./infra-n8n/hooks/postprovision.mjs
```
`azd up` provisions all resources successfully, then fails:
```
ERROR: step "cmdhook-postprovision" failed: ... hook configuration for 'postprovision'
is invalid, script with file extension '.mjs' is not valid. script type is not valid.
Supported extensions: .sh, .ps1, .py, .js, .ts, .cs. Alternatively, set 'kind'
(e.g. kind: python) or 'shell' (e.g. shell: sh).
```

azd 1.28.0's hook runner does **not** accept `.mjs`. Supported node extension is `.js`.

**Fix applied in this run (works, stays cross-platform):**
- Renamed hook to `infra-n8n/hooks/postprovision.js` and wrote it as **CommonJS**
  (`const { execFileSync } = require('node:child_process')`) so `node` runs it
  regardless of any `package.json` `type` field.
- Updated `azure.yaml` to `run: ./infra-n8n/hooks/postprovision.js`.
- Re-ran via `azd hooks run postprovision` → `WEBHOOK_URL` set successfully.
- Hook still uses only `execFileSync` with argument arrays — no shell strings,
  `chmod`, command substitution, or pipes — so it remains Windows/macOS/Linux portable.

**Recommended doc change:** Update the n8n, container-apps-deployment, and
journey-runner skills to prescribe `.js` (CommonJS) or `.ts` for azd hooks instead of
`.mjs`. If ESM is desired, `.js` requires a `package.json` with `"type": "module"`
adjacent to the hook, which adds fragility; CommonJS `.js` is the most robust choice.
Alternatively document `shell: sh` / `kind: node`, but a bare `.js` path is simplest.

---

## Non-issues (expected behavior, recorded to avoid future false alarms)

- **`GET /rest/login` → HTTP 401 on a fresh instance.** The n8n SPA probes login state
  before rendering the owner-setup screen. This is expected auth behavior, not a broken
  resource. The screenshot helper (`scripts/capture-screenshot.mjs`) classifies this
  specific 401 as benign.
- **Bicep `BCP334` warnings** on resource names using `uniqueString` (length may be < 4).
  Harmless — the 13-char token always satisfies the minimum. No action needed.
