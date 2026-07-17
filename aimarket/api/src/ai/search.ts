/**
 * Semantic product search adapter (Azure AI Search).
 *
 * The route layer depends only on `ProductSearchProvider`, so it can be tested
 * with an in-memory fake and swapped for the real Azure adapter without any
 * route changes. `AzureAiSearchProvider` depends on the minimal
 * `SearchClientLike` surface, which the official `@azure/search-documents`
 * `SearchClient` satisfies structurally — the SDK is only imported lazily by
 * `buildSearchProvider` when credentials are configured.
 */
import type { SearchConfig } from './config.js';
import type { Product } from '../models/product.js';

export interface SearchFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

/** A single ranked hit: the product id and a normalized 0–1 relevance score. */
export interface SearchHit {
  id: string;
  score: number;
}

/** Document shape pushed to the Azure AI Search index (`aimarket-products`). */
export interface ProductIndexDocument {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  rating: number;
}

export interface ProductSearchProvider {
  /** Return up to `top` ranked hits (id + score) for the query and filters. */
  search(query: string, filters: SearchFilters, top: number): Promise<SearchHit[]>;
  /** Push (merge-or-upload) product documents into the index. */
  indexProducts(products: ProductIndexDocument[]): Promise<number>;
}

/** Narrow structural view of the Azure `SearchClient` we actually use. */
export interface SearchClientLike {
  search(
    searchText: string,
    options: Record<string, unknown>,
  ): Promise<{
    results: AsyncIterable<{
      document: { id: string };
      score?: number;
      rerankerScore?: number;
    }>;
  }>;
  mergeOrUploadDocuments(documents: ProductIndexDocument[]): Promise<unknown>;
}

// Azure's semantic reranker returns scores in the 0–4 range; normalize to 0–1.
const RERANKER_MAX = 4;

/** Build an OData `$filter` expression from the optional search filters. */
export function buildFilter(filters: SearchFilters): string | undefined {
  const clauses: string[] = [];
  if (filters.category) {
    // Escape single quotes per OData literal rules.
    clauses.push(`category eq '${filters.category.replace(/'/g, "''")}'`);
  }
  if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)) {
    clauses.push(`price ge ${filters.minPrice}`);
  }
  if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) {
    clauses.push(`price le ${filters.maxPrice}`);
  }
  return clauses.length ? clauses.join(' and ') : undefined;
}

function normalizeScore(hit: { score?: number; rerankerScore?: number }): number {
  if (typeof hit.rerankerScore === 'number' && Number.isFinite(hit.rerankerScore)) {
    return Math.max(0, Math.min(1, hit.rerankerScore / RERANKER_MAX));
  }
  if (typeof hit.score === 'number' && Number.isFinite(hit.score)) {
    // BM25 `@search.score` is unbounded; squash into (0,1) for a stable contract.
    return Math.max(0, Math.min(1, hit.score / (hit.score + 1)));
  }
  return 0;
}

export class AzureAiSearchProvider implements ProductSearchProvider {
  constructor(
    private readonly client: SearchClientLike,
    private readonly semanticConfiguration: string,
  ) {}

  async search(query: string, filters: SearchFilters, top: number): Promise<SearchHit[]> {
    const filter = buildFilter(filters);
    const response = await this.client.search(query, {
      queryType: 'semantic',
      semanticSearchOptions: { configurationName: this.semanticConfiguration },
      top,
      filter,
      select: ['id'],
    });

    const hits: SearchHit[] = [];
    for await (const result of response.results) {
      if (!result?.document?.id) continue;
      hits.push({ id: result.document.id, score: round2(normalizeScore(result)) });
    }
    return hits;
  }

  async indexProducts(products: ProductIndexDocument[]): Promise<number> {
    if (products.length === 0) return 0;
    await this.client.mergeOrUploadDocuments(products);
    return products.length;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map a full `Product` down to the index document shape. */
export function toIndexDocument(product: Product): ProductIndexDocument {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    tags: product.tags,
    price: product.price,
    rating: product.rating,
  };
}

/**
 * Construct the real Azure AI Search provider. The `@azure/search-documents`
 * SDK is imported dynamically so the local (fallback) path never loads it.
 * Returns `null` when config is absent.
 */
export async function buildSearchProvider(
  config: SearchConfig | null,
): Promise<ProductSearchProvider | null> {
  if (!config) return null;
  const { SearchClient, AzureKeyCredential } = await import('@azure/search-documents');
  const client = new SearchClient(
    config.endpoint,
    config.indexName,
    new AzureKeyCredential(config.key),
  ) as unknown as SearchClientLike;
  return new AzureAiSearchProvider(client, config.semanticConfiguration);
}

/**
 * Create (or update) the `aimarket-products` index and its `aimarket-semantic`
 * configuration if it does not already exist. Idempotent — safe to call on
 * every startup. Must run before documents are pushed, because
 * `mergeOrUploadDocuments` fails when the index is absent. The
 * `@azure/search-documents` SDK is imported dynamically. Returns `true` when
 * the index is ensured, `false` when Search is not configured.
 */
export async function ensureSearchIndex(config: SearchConfig | null): Promise<boolean> {
  if (!config) return false;
  const { SearchIndexClient, AzureKeyCredential } = await import('@azure/search-documents');
  const indexClient = new SearchIndexClient(
    config.endpoint,
    new AzureKeyCredential(config.key),
  );

  const index = {
    name: config.indexName,
    fields: [
      { name: 'id', type: 'Edm.String', key: true, filterable: true, searchable: false, sortable: false, facetable: false },
      { name: 'name', type: 'Edm.String', searchable: true, sortable: true },
      { name: 'description', type: 'Edm.String', searchable: true },
      { name: 'category', type: 'Edm.String', searchable: true, filterable: true, facetable: true },
      { name: 'tags', type: 'Collection(Edm.String)', searchable: true, filterable: true, facetable: true },
      { name: 'price', type: 'Edm.Double', filterable: true, sortable: true },
      { name: 'rating', type: 'Edm.Double', filterable: true, sortable: true },
    ],
    semanticSearch: {
      configurations: [
        {
          name: config.semanticConfiguration,
          prioritizedFields: {
            titleField: { name: 'name' },
            contentFields: [{ name: 'description' }],
            keywordsFields: [{ name: 'tags' }],
          },
        },
      ],
    },
  };

  // createOrUpdateIndex is idempotent; the structural cast keeps this decoupled
  // from the SDK's exact generated types while matching its runtime contract.
  await (indexClient as unknown as {
    createOrUpdateIndex(index: unknown): Promise<unknown>;
  }).createOrUpdateIndex(index);
  return true;
}
