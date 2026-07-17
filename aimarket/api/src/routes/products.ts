import { Router } from 'express';
import type { DataStore } from '../data/interfaces.js';
import { AppError } from '../errors.js';
import {
  validateCreateProduct,
  validateUpdateProduct,
  toProductSummary,
  type Product,
  type CreateProductInput,
  type UpdateProductInput,
} from '../models/product.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { parsePagination, parseFloatParam, totalPages } from '../http/pagination.js';
import type { ProductSearchProvider, SearchFilters } from '../ai/search.js';
import { toIndexDocument } from '../ai/search.js';

const SEARCH_TOP = 10;

/** Fetch every active product (used by the search fallback and reindex). */
async function getAllActiveProducts(store: DataStore): Promise<Product[]> {
  const { data } = await store.products.getAll({
    page: 1,
    pageSize: 10000,
    status: 'active',
  });
  return data;
}

/** Project a full product to the search-result shape (summary + score). */
function toSearchResult(product: Product, score: number) {
  return { ...toProductSummary(product), score };
}

export function createProductsRouter(
  store: DataStore,
  searchProvider: ProductSearchProvider | null = null,
): Router {
  const router = Router();

  // GET /api/products
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const minPrice = parseFloatParam(req.query.minPrice);
      const maxPrice = parseFloatParam(req.query.maxPrice);

      const { data, totalCount } = await store.products.getAll({
        page,
        pageSize,
        category,
        minPrice,
        maxPrice,
        status,
      });

      res.json({
        data: data.map(toProductSummary),
        page,
        pageSize,
        totalCount,
        totalPages: totalPages(totalCount, pageSize),
      });
    }),
  );

  // POST /api/products/search  (AI-powered semantic search; SQLite LIKE fallback)
  router.post(
    '/search',
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const query = typeof body.query === 'string' ? body.query : '';
      if (query.trim() === '') {
        throw AppError.validation([{ field: 'query', message: 'query is required' }]);
      }

      const filters: SearchFilters = {
        category: typeof body.category === 'string' ? body.category : undefined,
        minPrice: typeof body.minPrice === 'number' ? body.minPrice : undefined,
        maxPrice: typeof body.maxPrice === 'number' ? body.maxPrice : undefined,
      };

      let results: Array<ReturnType<typeof toSearchResult>> | null = null;

      if (searchProvider) {
        try {
          // Two-step: the index returns ids + scores, then we hydrate full
          // product details (shortDescription, imageUrl) from the database.
          const hits = await searchProvider.search(query, filters, SEARCH_TOP);
          const hydrated = await Promise.all(
            hits.map(async (hit) => {
              const product = await store.products.getById(hit.id);
              return product ? toSearchResult(product, hit.score) : null;
            }),
          );
          results = hydrated.filter(
            (r): r is ReturnType<typeof toSearchResult> => r !== null,
          );
        } catch (err) {
          // Azure AI Search unavailable → degrade to the local text search.
          console.warn(
            'Semantic search failed; falling back to text search:',
            err instanceof Error ? err.message : String(err),
          );
          results = null;
        }
      }

      if (results === null) {
        // Local fallback: SQLite LIKE search with a rank-based score so the
        // response contract (each result carries a 0–1 score) stays stable.
        const matches = (await store.products.search(query, filters)).slice(0, SEARCH_TOP);
        const n = matches.length;
        results = matches.map((product, i) =>
          toSearchResult(product, n > 0 ? Math.round(((n - i) / n) * 100) / 100 : 0),
        );
      }

      res.json({ data: results, query, count: results.length });
    }),
  );

  // POST /api/products/reindex  (push all active products to Azure AI Search)
  router.post(
    '/reindex',
    asyncHandler(async (_req, res) => {
      if (!searchProvider) {
        throw new AppError(
          503,
          'INTERNAL_ERROR',
          'Semantic search is not configured. Set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_KEY to enable indexing (provisioned in Phase 4).',
        );
      }
      const products = await getAllActiveProducts(store);
      const indexed = await searchProvider.indexProducts(products.map(toIndexDocument));
      res.json({ indexed });
    }),
  );

  // GET /api/products/:id
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const product = await store.products.getById(req.params.id);
      if (!product) throw AppError.notFound('Product not found');
      res.json(product);
    }),
  );

  // POST /api/products
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const errors = validateCreateProduct(req.body);
      if (errors.length > 0) throw AppError.validation(errors);

      const input = req.body as CreateProductInput;
      const seller = await store.users.getById(input.sellerId);
      if (!seller || seller.role !== 'seller') {
        throw AppError.validation([
          { field: 'sellerId', message: 'sellerId must reference an existing user with role seller' },
        ]);
      }

      const product = await store.products.create(input);
      res.status(201).json(product);
    }),
  );

  // PUT /api/products/:id
  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const errors = validateUpdateProduct(req.body);
      if (errors.length > 0) throw AppError.validation(errors);

      const updated = await store.products.update(req.params.id, req.body as UpdateProductInput);
      if (!updated) throw AppError.notFound('Product not found');
      res.json(updated);
    }),
  );

  return router;
}
