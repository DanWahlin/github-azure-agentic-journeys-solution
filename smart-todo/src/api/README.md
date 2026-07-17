# SmartTodo API (Azure Functions v4, Node.js 24 + TypeScript)

The Phase 1 backend for SmartTodo. Implements the repository pattern over Azure
SQL (managed identity) with AI-powered step generation via gpt-5-mini.

## Layout

```
src/
  models/       Todo, ActionStep, error types
  data/         Repository interfaces, Azure SQL + in-memory implementations,
                factory, schema, seed data
  ai/           gpt-5-mini step generation (injectable, testable)
  functions/    HTTP triggers (getTodos, createTodo, updateTodo, deleteTodo,
                generateSteps, updateStep)
  validation.ts, logic.ts, http.ts
scripts/verify-api.mjs   Portable end-to-end HTTP verifier
test/                    Unit + handler tests (node:test, repository double)
```

Functions never import a database client directly — they call `getDataStore()`
from `data/factory.ts`, which runs `initialize()` once and caches the result.

## Configuration

Copy `local.settings.json.example` to `local.settings.json` and fill in values.
Never commit real credentials — `local.settings.json` is gitignored.

| Variable | Purpose |
|----------|---------|
| `AZURE_SQL_SERVER` | SQL FQDN in Azure (`<name>.database.windows.net`) |
| `AZURE_SQL_DATABASE` | Database name |
| `AZURE_SQL_USER` / `AZURE_SQL_PASSWORD` | Optional local SQL auth. When unset, the API uses Microsoft Entra managed identity (`azure-active-directory-default`). |
| `AZURE_AI_ENDPOINT` / `AZURE_AI_KEY` / `AZURE_AI_DEPLOYMENT` | Foundry/Azure OpenAI for step generation |
| `DATA_STORE` | `sql` (default) or `memory` (dependency-free local/dev store) |

## Commands

```bash
npm install
npm run build          # tsc -> dist/functions/*.js
npm test               # node:test suite (uses in-memory repository double)
npm run seed           # idempotent Azure SQL seed
npm start              # func start (needs Azurite when AzureWebJobsStorage=UseDevelopmentStorage=true)
npm run verify         # node scripts/verify-api.mjs against a running host
```

### Local run without a database

On hosts without Azure SQL (e.g. Linux/ARM64), run the API against the in-memory
store to exercise the HTTP layer:

```bash
npm run azurite &                 # local Functions storage
DATA_STORE=memory npm start
node scripts/verify-api.mjs       # AI checks skipped unless AZURE_AI_* is set
```

The in-memory store is a test double only. The real managed-identity Azure SQL
implementation (`data/sqlDataStore.ts`) is always used in Azure.
