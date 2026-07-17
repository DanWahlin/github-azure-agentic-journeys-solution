# AIMarket Storefront (`web/`)

React 18 + TypeScript + Vite + Tailwind CSS storefront for the AIMarket API.

## Features

- **Product grid** (`/`) — responsive card grid (1/2/3 columns), each card shows image,
  name, short description, price, star rating, and category badge.
- **Search** — plain client-side filtering by name/tag (debounced 300ms) plus an
  **AI Search** toggle wired to the API's semantic-search contract (`POST /products/search`).
- **Category filter** — All, Electronics, Clothing, Home, Sports, Books, Toys.
- **Product detail** (`/products/:id`) — large image, full description, tags, inventory,
  quantity selector (1–10), Add to Cart, out-of-stock handling.
- **Cart** (`/cart`) — editable quantities, line totals, subtotal/item count, Place Order
  (calls `POST /orders`), order confirmation, empty-cart state.
- **ChatWidget** — floating assistant showing a Phase 3 "coming soon" placeholder (not wired).
- Loading skeletons/spinners and typed error states throughout.

## Configuration

The API base URL is configurable and never hardcoded to a fixed port or production URL:

```
const API_BASE = import.meta.env.VITE_API_URL || '/api';
```

- **Local dev:** leave `VITE_API_URL` unset — the Vite dev/preview proxy maps `/api` to the
  API server. Override the target with `VITE_API_PROXY_TARGET` (defaults to `http://localhost:3000`).
- **Production / direct calls:** set `VITE_API_URL` to the full API base including `/api`,
  e.g. `https://ca-api-xxxx.azurecontainerapps.io/api`.

See `.env.example`.

## Commands

```bash
npm install
npm run build     # type-check + vite build
npm test          # vitest (unit + component tests)
npm run preview   # serve the production build
npm run verify    # portable storefront + API + image verifier
```

### Verifier

`scripts/verify-web.mjs` checks a running preview server and API:
1. the SPA shell is served, 2. the API returns all 10 seed products, and
3. every product image returns HTTP 2xx with an `image/*` content type.

Env: `WEB_URL` (default `http://localhost:4173`), `API_URL` (falls back to the API's
`.runtime-port` file, then `http://localhost:3000`).
