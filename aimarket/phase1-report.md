# AIMarket — Phase 1 Report (API)

**Date:** 2026-07-17
**Scope:** Phase 1 of 4 — build the AIMarket REST API from `PLAN.md`. No Azure resources created.
**Stack:** Node.js 24 (`v24.13.0`) + TypeScript 5.7 + Express 4, ESM (`NodeNext`), SQLite via `better-sqlite3`.

## Outcome

Fresh build (no pre-existing `api/`). All project files, models, validation, repository
pattern, SQLite implementation, seed data, REST routes, error handling, tests, and
`scripts/verify-api.mjs` were generated under `api/`. Dependencies installed, build clean,
all unit/integration tests pass, and the verifier passes against real HTTP behavior.

> Context: the prior attempt (`copilot-permission-failure.log`) was blocked by a sandbox that
> denied executing `node`/`curl`, not by a journey defect. This environment runs them, so the
> build proceeded normally. No new journey defect found → `issues.md` intentionally not created.

## What was built (`api/`)

```
api/
├── package.json / tsconfig.json / .gitignore / .env.example
├── src/
│   ├── index.ts                  # server entry; configurable + free-port selection
│   ├── app.ts                    # Express app factory (CORS, JSON, /api routes, error handlers)
│   ├── errors.ts                 # AppError + documented error envelope
│   ├── http/pagination.ts        # query parsing, pageSize cap (max 100)
│   ├── middleware/errorHandler.ts# async wrapper, 404, global error handler
│   ├── models/                   # validation.ts, product.ts, order.ts, user.ts
│   ├── data/                     # interfaces.ts, store.ts (factory), sqlite.ts, seed.ts
│   └── routes/                   # products.ts, orders.ts, users.ts, chat.ts
├── tests/                        # validation.test.ts, api.test.ts (node:test + tsx)
└── scripts/verify-api.mjs        # cross-platform HTTP verifier
```

- **Repository pattern:** `interfaces.ts` → `sqlite.ts` → `store.ts` factory reading
  `DATA_PROVIDER` (default `sqlite`). Routes receive a `DataStore` and never import DB clients.
- **SQLite specifics:** `journal_mode=WAL`, `foreign_keys=ON`, tags stored as JSON strings and
  parsed on read, `order_items` junction table, seed loaded on empty DB.
- **Seed data:** exact 10 products + 2 users + 2 historical orders with the IDs from `PLAN.md`.
  Seed orders do **not** decrement inventory. All prices/inventory/ratings/tags match the spec.
- **Order business logic (atomic transaction):** validates product existence + `active` status,
  checks inventory, captures `priceAtPurchase` from the current product price (not the request),
  computes `total` server-side, then decrements inventory.

## Price validation (spec requirement)

`isValidPrice` (in `src/models/validation.ts`) requires a finite positive number, then compares
the input against `Math.round(value*100)/100` with a `1e-9` epsilon — it never uses the unsafe
`Math.round(value*100) === value*100` exact-product comparison.

| Input | Result |
|-------|--------|
| `64.99` | accepted |
| `0.1`   | accepted |
| `64.991`| rejected |
| `NaN`   | rejected |
| `+Infinity` | rejected |
| `-Infinity` | rejected |

Covered by unit tests and by the live `PUT /api/products/:id` verifier check (64.99 → 200,
64.991 → 400 `VALIDATION_ERROR`).

## Image URLs

All 10 seed `imageUrl`s were requested and returned **HTTP 200**. The validated prod-10 photo ID
`photo-1587654780291-39c9404d746b` is preserved. `verify-api.mjs` re-fetches every product image
and fails if any is not 2xx.

## Configurable + free port (no process killed)

`PORT` (default 3000) is configurable. On `EADDRINUSE` the server probes the next ports and finally
an ephemeral port — it never kills the process holding the port. During this run port 3000 was
already in use, so the server logged *"Port 3000 in use; trying 3001 (leaving the existing process
alone)"* and bound **3001**. After stopping the tracked API, the unrelated process on 3000 still
responded `200`, confirming it was untouched. The bound port is published to `api/.runtime-port`
so the verifier discovers it automatically (also overridable via `API_URL`).

## Commands run + evidence

| Step | Command | Result |
|------|---------|--------|
| Install | `npm install` | 125 packages, 0 vulnerabilities |
| Build | `npm run build` (`tsc`) | clean, no errors |
| Tests | `npm test` (`node --import tsx --test`) | **28 passed, 0 failed** |
| Start | `PORT=3000 npm start` (tracked) | bound `3001` (3000 busy, not killed) |
| Verify | `node scripts/verify-api.mjs` | **14 passed, 0 failed** |
| Stop | stopped only the tracked API process | other 3000 process still `200` |

### Verifier checks (all passing, live HTTP)
- `GET /api/health` → 200 `{status:"ok"}`
- `GET /api/products` → all 10 seed products; list uses summary shape (no `description`/`sellerId`)
- `GET /api/products?category=Electronics` → exactly 3 electronics
- `GET /api/products/prod-1` → full description + `sellerId`
- `GET /api/products/nonexistent` → 404 `NOT_FOUND` envelope
- `POST /api/orders` → pending order, server-side `priceAtPurchase` + `total`, inventory decremented
- `POST /api/orders` insufficient inventory → 400 `INSUFFICIENT_INVENTORY`
- `PUT /api/products/prod-3` → 64.99 accepted, 64.991 rejected
- `POST /api/users/register` → create + duplicate-email 400 `DUPLICATE_EMAIL`
- All product image URLs → HTTP 2xx

## Notes for later phases
- `POST /api/chat` returns 503 until `AZURE_OPENAI_*` credentials are configured (Phase 3/4).
- `POST /api/products/search` uses a SQLite `LIKE` fallback; Azure AI Search wiring is Phase 3/4.
- `store.ts` has `cosmos`/`postgres` branches stubbed for the Phase 4 data-provider swap.
