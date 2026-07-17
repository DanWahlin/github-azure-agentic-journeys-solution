# AIMarket — Phase 2 Report (Frontend)

**Date:** 2026-07-17
**Scope:** Phase 2 of 4 — build the React storefront from `PLAN.md` / `phase2-prompt.md`. No Azure resources created.
**Stack:** React 18 + TypeScript 5.7 + Vite 5 + Tailwind CSS 3, React Router 6. Tests with Vitest + React Testing Library (jsdom).

## Outcome

Fresh build under `client/`, matching both `JOURNEY.md` and `PLAN.md`. Full storefront generated: product catalog/cards, category
filtering, search with a semantic-search (AI Search) toggle wired to the API contract,
cart/order flow, loading/error states, responsive Tailwind styling, and a configurable
`VITE_API_URL`. Dependencies installed, type-check + production build clean, **26 unit/component
tests pass**, and both the portable verifier and a real headless-browser check pass against the
live API.

## What was built (`client/`)

```
client/
├── package.json / tsconfig.json / vite.config.ts
├── tailwind.config.js / postcss.config.js / index.html
├── .env.example / .gitignore / README.md
├── public/favicon.svg
├── src/
│   ├── main.tsx / App.tsx / index.css / types.ts / format.ts / vite-env.d.ts
│   ├── api.ts                      # single API client, configurable base, typed ApiError
│   ├── context/CartContext.tsx     # Map<productId,{product,quantity}> reducer + provider
│   ├── hooks/useDebounce.ts
│   ├── components/                 # ProductCard, SearchBar, CategoryFilter, ChatWidget,
│   │                               #   CartIcon, Navbar, StarRating, Loading, ErrorMessage
│   ├── pages/                      # ProductGrid (home), ProductDetail, Cart
│   └── tests/                      # api, cart reducer, ProductGrid, Cart, ChatWidget (+ setup)
└── scripts/verify-web.mjs          # portable (browser-free) storefront + API + image verifier
```

## Spec conformance

- **Product grid (`/`)** — responsive `grid-cols-1 / sm:2 / lg:3`; each card shows image, name,
  short description, price, star rating, and a category badge; only `active` products shown.
- **Search** — plain client-side filter by **name + tags**, debounced 300ms. An **AI Search**
  toggle is the semantic-search UI: it calls `POST /products/search` (the API's contract, backed
  by the LIKE fallback today; Phase 3/4 swaps in Azure AI Search with no client change).
- **Category filter** — All, Electronics, Clothing, Home, Sports, Books, Toys.
- **Product detail (`/products/:id`)** — large image, full description, tags, rating/review count,
  inventory status, quantity 1–10 selector, Add to Cart, **Out of Stock** disables the button,
  "Back to Products" link, 404-aware error state.
- **Cart (`/cart`)** — editable quantities, per-line totals, subtotal + item count, **Place Order**
  → `POST /orders` with the demo `userId: user-buyer-1` and a fixed shipping address, order-ID
  confirmation + cart clear, and an empty-cart state.
- **ChatWidget** — floating bottom-right button, collapsed by default, expands to a 400×500 panel
  showing "Shopping assistant coming soon! (Phase 3)". **Not wired to the API** (per spec); the
  `sendChatMessage` client contract is defined and ready for Phase 3.
- **CartIcon** — nav badge with total item count, links to `/cart`.
- **State** — cart in React context (`Map<productId,…>`), survives in-app navigation, resets on
  full refresh (verified: navigating to `/cart` via a full page reload correctly empties the cart).
- **Loading/error** — skeleton grid, spinners, and a typed `ErrorMessage` (with retry) throughout.

## Configurable API base (no hardcoded port / prod URL)

`src/api.ts` uses exactly `const API_BASE = import.meta.env.VITE_API_URL || '/api'`. Endpoint
paths (`/products`, `/orders`, `/products/search`, `/chat`) omit the `/api` prefix. In dev/preview
the Vite proxy maps `/api` → `VITE_API_PROXY_TARGET` (default `http://localhost:3000`, fully
overridable — the port is never hard-baked into shipped code). For direct/prod calls, set
`VITE_API_URL` to the full base including `/api`. No production URL is hardcoded anywhere.

## Tests (Vitest + RTL) — 26 passing

| File | Coverage |
|------|----------|
| `api.test.ts` | URL building (no `/api/api` doubling), category param + `All` omission, JSON POST headers/body for orders, search body, typed `ApiError` on 404, network-error wrapping |
| `cart.test.ts` | reducer add/accumulate, inventory cap, MAX_QUANTITY(10) cap, set-quantity→remove, remove, clear, immutability |
| `ProductGrid.test.tsx` | skeleton→cards, category reload, client-side name filter, AI Search calls the search API, error state |
| `Cart.test.tsx` | empty state, item count/subtotal, place-order payload (`user-buyer-1` + address) + confirmation, error alert |
| `ChatWidget.test.tsx` | collapsed default, expand → placeholder, close |

## Commands run + evidence

| Step | Command | Result |
|------|---------|--------|
| Install | `npm install` | 243 packages |
| Build | `npm run build` (`tsc --noEmit` + `vite build`) | clean, 51 modules |
| Tests | `npm test` (`vitest run`) | **26 passed, 0 failed** |
| Start API | `PORT=0 node dist/index.js` (tracked) | bound `44469`, wrote `.runtime-port` |
| Build web→API | `VITE_API_URL=http://127.0.0.1:44469/api npm run build` | clean |
| Start web | `vite preview --port 0` (tracked) | bound `36175` |
| Verify (portable) | `node scripts/verify-web.mjs` | **4 passed, 0 failed** |
| Verify (browser) | headless chromium E2E | 10 cards, API 200, 10 images loaded, order POST → 201 |
| Stop | stopped only the tracked API + preview processes | `.runtime-port` auto-removed on shutdown |

### Portable verifier (`scripts/verify-web.mjs`) — browser-free, all passing
- Storefront serves the SPA shell (root div + module script) and the AIMarket title.
- API returns all **10** seed products (the storefront's data source).
- **All 10 product images return HTTP 2xx with an `image/*` content type.**

### Real-browser confirmation (temporary, not committed)
Drove a headless chromium against the built preview to prove the *rendered* storefront consumes
the API: 10 `product-card`s rendered, a single `GET …/api/products` returned **200**, all 10
`<img>` had `naturalWidth > 0` (no broken images), zero page errors, and the cart→Place Order flow
issued `POST …/api/orders` returning **201** with a confirmed order ID. Screenshot saved to the
session artifacts. The Playwright dependency and scratch scripts were removed afterward so the
shipped project stays lean and its verifier stays dependency-free.

## Failures repaired during the run
- `tsc` flagged an unused `beforeEach` import in `api.test.ts` (blocked the build) → removed.
- A test-only cart seed helper set state during render → moved to `useEffect` and made the
  affected assertions async; eliminated the React warning.

## Notes for later phases
- The **AI Search** toggle already targets `POST /products/search`; Phase 3 only needs to make
  that endpoint semantic (Azure AI Search) — no client change.
- The **ChatWidget** is intentionally a placeholder; Phase 3 wires it to `POST /chat` via the
  existing `sendChatMessage` client function.
- Phase 4: build the client image with `VITE_API_URL=<API_URL>/api` (no `/api` proxy block in
  nginx), and ensure `azure.yaml` points the frontend service at **`client/`**.
