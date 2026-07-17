# AIMarket — Phase 3 Report (AI Features)

**Date:** 2026-07-17
**Scope:** Phase 3 of 4 — add semantic product search (Azure AI Search) and the shopping
assistant (Microsoft Foundry) to the existing API + React storefront from `PLAN.md`.
**No Azure resources were created.** Credentials are never committed or printed.
**Stack (unchanged):** API = Node.js 24 + TypeScript + Express + SQLite; Client = React 18 +
Vite + Tailwind. Added SDKs: `@azure/search-documents`, `openai`, `@azure/identity`.

## Outcome

Both AI features implemented cleanly behind testable interfaces with graceful local
fallbacks. All tests pass: **API 52/52** (was 28), **client 31/31** (was 26). The live API
verifier passes **14/14**. Build is clean for both projects. The real Azure SDK adapters were
exercised end-to-end against a local mock (chat fully; search request URL/options confirmed).

No new journey defect was found → `issues.md` intentionally not created. One spec gap
("fall back to text search if Azure AI Search is unavailable") was implemented as part of the
feature, not logged as a defect.

## Design — testable interfaces, dynamic SDK loading

The route layer depends only on small interfaces, so it is fully testable with in-memory fakes
and the real Azure SDKs are **imported dynamically only when configured** — the local fallback
path never loads them.

```
api/src/ai/
├── config.ts     # loadSearchConfig/loadChatConfig from env (no secret logging)
├── search.ts     # ProductSearchProvider iface + AzureAiSearchProvider (+ buildSearchProvider)
├── chat.ts       # ChatCompletionClient iface + AzureFoundryChatClient (+ buildChatClient)
└── services.ts   # AiServices { search, chat }; buildAiServices(env) → nulls when unconfigured
```

`createApp(store, ai)` injects `AiServices`; `index.ts` builds them from env and does a
best-effort startup index push when Search is configured. When `ai.search`/`ai.chat` are `null`
(no credentials), routes use their fallbacks.

## AI Feature 1 — Semantic Product Search

- **`POST /api/products/search`** — flat body `{ query, category?, minPrice?, maxPrice? }`;
  response `{ data, query, count }` (spec-exact). Each result is the product summary **plus a
  0–1 `score`**. Returns **top 10**.
- **Two-step** (configured): the index returns `{id, score}`; the API hydrates full product
  details (`shortDescription`, `imageUrl`, …) from SQLite and merges them, preserving rank.
- **`AzureAiSearchProvider`** issues a semantic query (`queryType: 'semantic'`,
  `semanticSearchOptions.configurationName: 'aimarket-semantic'`, `top`, OData `filter`,
  `select: ['id']`) and normalizes scores to 0–1 (reranker `/4`; BM25 squashed).
- **Fallbacks:** no provider **or** provider throws (Azure AI Search unavailable) → SQLite
  `LIKE` search with rank-based scores. Identical response contract either way.
- **`POST /api/products/reindex`** — pushes all active products; **503** with an actionable
  message when Search is unconfigured. Startup indexing runs best-effort (non-fatal).
- **Frontend:** the existing SearchBar "AI Search" toggle already calls `POST /products/search`;
  added an **"✨ AI-powered results"** label on the grid when semantic search is active.

## AI Feature 2 — Shopping Assistant

- **`POST /api/chat`** — validates `{ messages: [...] }`; injects the **live active catalog** as
  JSON into the exact `PLAN.md` system prompt; forwards the **full message history**; returns
  `{ role: 'assistant', content }`. `max_tokens` = 500.
- **`AzureFoundryChatClient`** targets the deployment (default `gpt-5-mini`). gpt-5 family uses
  `max_completion_tokens` and **omits temperature**; the `gpt-4.1` fallback uses `max_tokens` +
  `temperature: 0.7`.
- **Auth ready for Phase 4:** key when `AZURE_OPENAI_KEY` is set, otherwise
  `DefaultAzureCredential` (managed identity, `Cognitive Services User`) — the production path.
- **Graceful errors:** **503** (actionable) when unconfigured; provider failures map to **502**
  without leaking credentials or raw SDK errors (verified by test).
- **Frontend:** `ChatWidget` is now fully wired — message list, input, send button, "Thinking…"
  indicator, and an actionable message on 503/error. `sendChatMessage` reads `res.content`.

## Environment Variables (Phase 3)

`AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_KEY`, `AZURE_SEARCH_INDEX` (default `aimarket-products`),
`AZURE_SEARCH_SEMANTIC_CONFIG` (default `aimarket-semantic`), `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_KEY` (optional — managed identity when absent), `AZURE_OPENAI_DEPLOYMENT`
(default `gpt-5-mini`), `AZURE_OPENAI_API_VERSION`. Documented in `api/.env.example`.
**When unset:** search → SQLite `LIKE`; `/api/chat` → 503.

## Tests added

**API (`api/tests/`):**
- `ai-config.test.ts` — env parsing, defaults, key-optional chat config.
- `ai-search.test.ts` — OData filter building/escaping, semantic query options, reranker/BM25
  score normalization, merge-upload, `toIndexDocument`.
- `ai-chat.test.ts` — gpt-5 vs gpt-4.1 token/temperature params, empty-content handling,
  system-prompt injection.
- `ai-routes.test.ts` — route-level with injected fakes: search `{data,query,count}` + score +
  two-step hydration, drops missing ids, flat filters, LIKE fallback, provider-throw → text
  fallback, reindex 503/success, chat `{role,content}` + catalog prompt + history, validation,
  502-without-leak.

**Client (`client/src/tests/`):**
- `ChatWidget.test.tsx` — rewritten for the wired widget: expand, send full history, render
  user/assistant turns, multi-turn history, 503 actionable message, disabled empty send, close.
- `api.test.ts` — search response `{data,query,count}` with `score`; `sendChatMessage` posts
  history and returns `content`; 503 → typed `ApiError`.
- `ProductGrid.test.tsx` — asserts the "AI-powered results" label appears.

## Commands run + evidence

| Step | Command | Result |
|------|---------|--------|
| Add deps | `npm install @azure/search-documents openai @azure/identity` | 46 pkgs, 0 vulns |
| API build | `npm run build` (`tsc`) | clean |
| API tests | `npm test` | **52 passed, 0 failed** |
| API verify | `node scripts/verify-api.mjs` (live) | **14 passed, 0 failed** |
| Client build | `npm run build` (`tsc --noEmit` + `vite build`) | clean |
| Client tests | `npm test` (`vitest run`) | **31 passed, 0 failed** |
| SDK glue check | construct real adapters (throwaway) | key-search, key-chat, MI-chat all build; null→null |
| E2E (real SDKs, mock) | chat via `openai` SDK | system prompt + `max_completion_tokens:500`, no temperature, `{role,content}` ✓ |

### Live endpoint checks (fallback mode, no credentials)
- `POST /products/search {query,category,minPrice,maxPrice}` → `{data,query,count}`, each result
  carries a numeric `score`.
- `POST /products/search {query:"  "}` → 400 `VALIDATION_ERROR`.
- `POST /products/reindex` → 503 (actionable).
- `POST /chat` → 503 with actionable message; `{messages:[]}` → 400.

## Failures repaired during the run
- **jsdom** has no `Element.scrollTo` → the ChatWidget auto-scroll used `el.scrollTop =
  el.scrollHeight` instead (works in jsdom and browsers). Client tests then passed.
- **Spec gap:** a provider error previously bubbled to a 500. Implemented the `PLAN.md`
  behavior — "fall back to simple text search if Azure AI Search is unavailable" — so a provider
  throw degrades to the LIKE search (covered by a new test).

## Notes for Phase 4
- Provision **Azure AI Search** (Basic SKU, `semanticSearch: 'free'`, `disableLocalAuth: false`),
  create the `aimarket-products` index + `aimarket-semantic` config, and wire
  `AZURE_SEARCH_ENDPOINT`/`AZURE_SEARCH_KEY` (admin key via `listAdminKeys()`).
- Provision **Microsoft Foundry** (`gpt-5-mini`, fallback `gpt-4.1`); set `AZURE_OPENAI_ENDPOINT`
  and **omit the key** so the API uses its managed identity (`Cognitive Services User`).
- Startup indexing populates the index automatically; `POST /api/products/reindex` re-pushes.
- No client changes required — the search/chat contracts are already final.
