# SmartTodo — Phase 1 Report

**Scope:** Build the SmartTodo API (Phase 1 of 3). Node.js 24 + TypeScript, Azure
Functions v4 programming model. No Azure provisioning. No committed credentials.

**Host:** Linux ARM64. No AMD64 emulation installed; no local SQL Server or Xcode
was run. Local validation uses an in-memory repository double while the real
managed-identity Azure SQL implementation is preserved for deployment.

## What was built (`smart-todo/src/api`)

| Area | Files |
|------|-------|
| Project config | `host.json`, `package.json`, `tsconfig.json`, `.funcignore`, `.gitignore`, `local.settings.json(.example)` |
| Models | `src/models/todo.ts`, `actionStep.ts`, `errors.ts` |
| Data access | `src/data/repositories.ts` (interfaces), `sqlDataStore.ts` (Azure SQL + managed identity), `memoryDataStore.ts` (test double), `factory.ts` (cached `initialize()`), `schema.ts`/`schema.sql`, `seedData.ts`, `seed.ts` |
| AI | `src/ai/stepGenerator.ts` (gpt-5-mini via `openai` SDK, injectable) |
| Validation / helpers | `src/validation.ts`, `src/logic.ts` (auto-completion rule), `src/http.ts` |
| Functions | `getTodos`, `createTodo`, `updateTodo`, `deleteTodo`, `generateSteps`, `updateStep` |
| Verifier | `scripts/verify-api.mjs` (portable HTTP E2E) |
| Tests | `test/validation`, `dataStore`, `logic`, `ai`, `handlers` |
| Docs | `src/api/README.md` |

## Spec conformance

- **Status enum** is exactly `pending | in_progress | completed`; `not_started` is
  never used. Invalid status → 400 `VALIDATION_ERROR`.
- **Endpoints** implemented per PLAN.md: `GET /api/todos` (userId required, 400 if
  missing; returns todos with nested `steps`), `POST /api/todos` (201, pending,
  title 1–500 trimmed), `PATCH /api/todos/:id` (200/404), `DELETE /api/todos/:id`
  (204, cascade), `POST /api/todos/:id/generate-steps` (200/404/503),
  `PATCH /api/todos/:id/steps/:stepId` (200/404, boolean check, auto-completion).
- **Repository pattern**: `TodoRepository`, `ActionStepRepository`, `DataStore`
  contracts; functions get a `DataStore` from the factory and never import the
  SQL client. `initialize()` runs once and is cached.
- **Azure SQL**: parameterized queries only; `[order]` bracket-quoted;
  `ON DELETE CASCADE`; `update()` supports `title`, `status`, and `stepsGenerated`;
  `azure-active-directory-default` (managed identity, no passwords) with optional
  local SQL auth; `AZURE_SQL_SERVER` kept as the full FQDN (not stripped).
- **Seed data**: exact IDs `todo-1..3` and `step-2-1..4`, `step-3-1..3` with the
  specified statuses/order; idempotent (skips when Todos already has rows).
- **AI**: exact system prompt; endpoint normalized to `/openai/v1/`; API-key auth;
  model from `AZURE_AI_DEPLOYMENT` (default `gpt-5-mini`); no temperature for gpt-5
  family (`max_completion_tokens: 1500`), temperature `0.7` + `max_tokens` only for
  the gpt-4.1 fallback; strips code fences; validates array of `{title, description}`;
  retries once with the stricter follow-up; throws `AI_SERVICE_ERROR` (503) after
  retry; assigns 1-based `order` and UUID `id` per step.
- **Errors**: `{ error: { code, message } }` with the documented code→status map.
- **Node entry point**: `"main": "dist/functions/*.js"` matches `tsc` output
  (`rootDir: src`, `outDir: dist`). `.funcignore` keeps `src/` and `tsconfig.json`
  for Oryx builds and excludes `node_modules`, `dist/**/*.map`, `local.settings.json`.

## Validation performed

- `npm run build` (tsc, strict) — **passes**, 0 errors.
- `npm test` (node:test) — **44/44 pass**. Coverage: validation rules, in-memory
  repository behavior (create/update/delete/cascade/ordering), auto-completion rule
  (all matrix cases), AI parsing/fence-stripping/retry/endpoint-normalization, and
  all six handlers via the in-memory store with an injected AI completer
  (201/400/404/204, auto-complete + revert, cascade absence).
- **End-to-end over real HTTP**: started Azurite + `func start` with
  `DATA_STORE=memory` (no SQL needed on ARM64). All six functions registered.
  `node scripts/verify-api.mjs` — **16/16 pass** (seed reads, create, status update,
  validation errors, delete, 404-on-missing, cascade absence). The AI path is
  correctly skipped because no `AZURE_AI_*` credentials are configured; it is
  covered instead by unit + handler tests with an injected completer.

## Credentials / security

- No credentials committed. `local.settings.json` has empty secret fields and is
  gitignored; a tracked `local.settings.json.example` documents the shape.
- `node_modules/`, `dist/`, `.azurite/`, `local.settings.json` are gitignored
  (verified with `git check-ignore`). Secret scan of `src/` found nothing.

## Notes / assumptions

- On ARM64 the SQL Server Linux container is AMD64-only; per instructions no
  emulation was installed. The Azure SQL implementation is exercised for
  type-safety via `tsc` and preserved unchanged for Phase 3 deployment; runtime
  SQL behavior is mirrored by the in-memory double for local tests.
- Added an optional `DATA_STORE=memory` switch in the factory purely to enable
  dependency-free local runs/tests; the default remains Azure SQL.
- `func start` prints a benign notice that .NET in-process isn't supported on
  linux-arm64 and selects the out-of-proc host — this does not affect the Node.js
  worker, which started and served all endpoints successfully.

## Defects

None. No `issues.md` created — no genuinely new defect was found; all checks pass.
