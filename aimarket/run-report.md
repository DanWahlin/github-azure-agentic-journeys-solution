# AIMarket — Phase 4 Run Report (Deploy & Verify)

**Date:** 2026-07-17
**Scope:** Phase 4 of 4 — containerize, generate Bicep/azd infrastructure, deploy the full
AIMarket stack (API + storefront + AI) to Azure, verify live, screenshot, and tear down.
**Result:** ✅ Deployed, verified end-to-end, and torn down. Only `rg-rr-aimarket-0717` was created and deleted.

## Environment

| Field | Value |
|-------|-------|
| Subscription | `[REDACTED]` (Visual Studio Enterprise) |
| Location | `westus` |
| azd environment | `rr-aimarket-0717` |
| Resource group | `rg-rr-aimarket-0717` |
| Host OS / arch | Linux / aarch64 (ARM64) |
| Tools | node v24.13.0, azd 1.28.0, az CLI (current), Docker 29.6.1 + buildx v0.35.0, gh 2.96.0 |
| Resource token | `km5obuwjrop4u` |

Build target for all images: **linux/amd64**. No privileged QEMU/binfmt emulation was installed.

## What was generated (this phase)

```
aimarket/
├── azure.yaml                     # azd config: api service + postprovision/postdeploy hooks
├── api/Dockerfile                 # multi-stage node:24-alpine (compiles better-sqlite3 for amd64)
├── api/.dockerignore
├── client/Dockerfile              # FROM --platform=$BUILDPLATFORM builder + nginx runtime
├── client/nginx.conf              # SPA try_files; NO /api proxy block
├── client/.dockerignore
└── infra/
    ├── main.bicep                 # subscription scope: RG + resources module + outputs
    ├── resources.bicep            # RG scope: all resources, role assignments, outputs
    ├── abbreviations.json
    ├── main.parameters.json
    └── hooks/
        ├── postprovision.js       # CommonJS: set configuration.registries identity=system
        └── postdeploy.js          # CommonJS: rebuild web with VITE_API_URL, buildx --push, update
```

App code change (Phase 4): `api/src/ai/search.ts` gained `ensureSearchIndex()` (creates the
`aimarket-products` index + `aimarket-semantic` config), invoked from `api/src/index.ts` before the
best-effort startup indexing. Without it, `mergeOrUploadDocuments` fails on a missing index. API
tests remained green (52/52).

## Architecture deployed

- **Azure Container Registry** (Basic) — private images, `adminUserEnabled: false`.
- **Log Analytics + Application Insights** — Container Apps logs + APM connection string wired to the API.
- **Azure AI Search** (Basic SKU, `semanticSearch: 'free'`, `disableLocalAuth: false`) — semantic product search.
- **Microsoft Foundry / Azure AI Services** (`kind: AIServices`, `gpt-5-mini` `2025-08-07` GlobalStandard, capacity 10).
- **Container Apps Environment** (`zoneRedundant: false` — required in westus).
- **API Container App** (targetPort 3000, system identity, probes on `GET /api/health`), env wired to Search (admin key secret) + Foundry (managed identity, no key).
- **Web Container App** (targetPort 80, nginx SPA, system identity).
- **Managed identities + RBAC**: each app's system identity has `AcrPull` on the ACR; the API identity has `Cognitive Services User` on the AI Services account (keyless Foundry auth).

## AVM deviations (documented per AGENTS.md policy)

A passing, teardown-safe journey was prioritized. The following used raw `Microsoft.*` resources
instead of AVM modules for a deterministic single-shot deploy (no registry restore / parameter drift):

| Resource | Reason |
|----------|--------|
| All resources | Raw `Microsoft.*` chosen for deterministic API versions and full control over the two-phase ACR-pull ordering. Bicep compiles clean; `azd up` provisioned all resources without drift. |
| Microsoft Foundry | Raw `Microsoft.CognitiveServices/accounts` (`AIServices`) + child `deployments` instead of `avm/ptn/ai-ml/ai-foundry` — the pattern module provisions many auxiliary resources and is heavier/slower than needed for a single gpt-5-mini deployment. |

`configuration.registries` (identity=system) is still explicitly configured — see next section.

## Deployment issues found & repaired (evidence-backed)

1. **azd default local Docker build (ARM64) → wrong arch + apk DNS failure.**
   First `azd up` built images locally on the ARM64 host. The API's `apk add` failed with a transient
   DNS error and images would have been ARM64. **Fix:** `docker.remoteBuild: true` (ACR) for the API.

2. **Container Apps stuck with NO revision (chicken-and-egg on `registries` identity=system).**
   With `configuration.registries { identity: system }` baked into the initial Bicep, ACA validated the
   registry at first-revision creation and hung indefinitely (both apps, `latestRevisionName: null`,
   >15 min) because `AcrPull` had not yet propagated to the just-created system identity.
   **Fix (skill-endorsed two-phase pattern):** grant `AcrPull` in Bicep, drop `registries` from the
   initial app definition, and set it via `infra/hooks/postprovision.js`
   (`az containerapp registry set --identity system`) **after** provisioning, before deploy. Verified:
   both apps now show `registries[0].identity = system` and pull private images successfully.

3. **ACR build task cannot parse `FROM --platform=$BUILDPLATFORM`.**
   Both azd `remoteBuild` and `az acr build` run ACR's classic dependency scanner, which errors with
   `unable to understand line FROM --platform=$BUILDPLATFORM`. The frontend Dockerfile **requires**
   `$BUILDPLATFORM` (keeps Vite/esbuild native on ARM64; final nginx stage is COPY-only). **Fix:** the
   API (no `$BUILDPLATFORM`) builds on ACR via azd `remoteBuild`; the **web** image is built by
   `infra/hooks/postdeploy.js` with local `docker buildx build --platform linux/amd64 --provenance=false --push`.
   The builder stage runs native on ARM64 and the COPY-only final stage needs **no** QEMU emulation.

4. **azd cross-platform local build didn't load the image for tagging** (`No such image: sha256:…`).
   A short-lived attempt to let azd build web locally failed at the tag step. **Fix:** web is not an azd
   build service; it is provisioned by Bicep and built/deployed by the postdeploy hook (proven working).

5. **better-sqlite3 has no Node 24 ABI prebuild → API build needs a toolchain.**
   On ACR the API `npm ci` tried to compile better-sqlite3 and failed (no Python). **Fix:** the API build
   stage installs `python3 make g++` (reliable on ACR's network) and compiles the binding for amd64.

No **new journey defect** was found — every issue above is a known Azure/tooling gotcha already covered by
the `container-apps-deployment` and `journey-runner` skills, or a normal environment/toolchain fact.
Therefore `issues.md` was intentionally **not** created.

## Live verification (all PASS)

Ran `node ../.github/scripts/verify-aimarket.mjs` → **PASS: health, 10 products, images, search, chat, storefront, and API integration.**

Concrete evidence (against live outputs):

| Check | Command | Result |
|-------|---------|--------|
| Health | `GET {API}/api/health` | `{"status":"ok"}` |
| Product count | `GET {API}/api/products` | **10** products |
| Semantic search | `POST {API}/api/products/search {"query":"budget friendly electronics"}` | count 3, top **Smart Home Hub** score 0.45 (semantic rank — not a literal keyword hit) |
| AI chat | `POST {API}/api/chat` "What laptops under $1500?" | gpt-5-mini: *"We have the UltraBook Pro 15 — $1,299.99, rating 4.7 …"* (catalog-grounded) |
| Product images | verifier re-fetches all 10 `imageUrl`s | all HTTP 2xx `image/*` |
| Storefront API integration | web `/assets/*.js` includes the API host | ✅ baked-in `VITE_API_URL` (`ca-api-…azurecontainerapps.io`) |
| App health | active revisions | api + web both **Healthy / Running**, 1 replica each |

## Screenshot

`screenshot-aimarket.png` — captured with the journey-runner helper (bundled Playwright Chromium,
`--fail-on-resource-errors true`). Result: **"Failed browser resources: none"** (exit 0). Visual review
confirms the full storefront: all 10 product cards with images, category filters, ✨ AI Search toggle,
star ratings, prices, and the chat-widget button.

## Cleanup

Cleanup policy: `after-verification`. Ran `azd down --force --purge --no-prompt` (9m48s).

**Teardown result — verified with live Azure queries:**

| Check | Command | Result |
|-------|---------|--------|
| Resource group removed | `az group exists -n rg-rr-aimarket-0717` | `false` ✅ |
| No tagged resources remain | `az resource list --tag azd-env-name=rr-aimarket-0717` | `0` ✅ |
| AI account purged (not soft-deleted) | `az cognitiveservices account list-deleted [?name=='ai-km5obuwjrop4u']` | `0` ✅ |
| Log Analytics | purged during `azd down` | ✅ |

Only `rg-rr-aimarket-0717` and its contents were deleted. No unrelated resource groups, deployments,
or soft-deleted resources were touched.
