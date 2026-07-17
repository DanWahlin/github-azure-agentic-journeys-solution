import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProducts, searchProducts, ApiError } from '../api';
import type { ProductSummary } from '../types';
import { SearchBar } from '../components/SearchBar';
import { CategoryFilter } from '../components/CategoryFilter';
import { ProductCard } from '../components/ProductCard';
import { CardSkeletonGrid, Spinner } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { useDebounce } from '../hooks/useDebounce';

function matchesQuery(product: ProductSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (product.name.toLowerCase().includes(q)) return true;
  return product.tags.some((tag) => tag.toLowerCase().includes(q));
}

export function ProductGrid() {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [aiSearch, setAiSearch] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI (semantic) search results, fetched from the API when enabled.
  const [aiResults, setAiResults] = useState<ProductSummary[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProducts({ category });
      setProducts(res.data.filter((p) => p.status === 'active'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!aiSearch || debouncedQuery.trim() === '') {
      setAiResults(null);
      setAiError(null);
      setAiLoading(false);
      return;
    }
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    searchProducts(debouncedQuery)
      .then((results) => {
        if (!cancelled) setAiResults(results);
      })
      .catch((err) => {
        if (!cancelled) {
          setAiError(err instanceof ApiError ? err.message : 'AI search failed.');
          setAiResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiSearch, debouncedQuery]);

  const visibleProducts = useMemo(() => {
    if (aiSearch && debouncedQuery.trim() !== '') {
      const base = aiResults ?? [];
      return category === 'All' ? base : base.filter((p) => p.category === category);
    }
    return products.filter((p) => matchesQuery(p, debouncedQuery));
  }, [aiSearch, aiResults, debouncedQuery, products, category]);

  const showAiSpinner = aiSearch && aiLoading && debouncedQuery.trim() !== '';
  const showAiLabel =
    aiSearch && debouncedQuery.trim() !== '' && !showAiSpinner && visibleProducts.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Browse products</h1>
        <p className="text-sm text-slate-500">
          {aiSearch
            ? 'AI search understands intent — try "gift for a coffee lover".'
            : 'Search by name or tag, or filter by category.'}
        </p>
      </div>

      <div className="space-y-4">
        <SearchBar
          value={query}
          onChange={setQuery}
          aiSearch={aiSearch}
          onToggleAiSearch={setAiSearch}
        />
        <CategoryFilter selected={category} onSelect={setCategory} />
      </div>

      {aiError ? (
        <p className="text-sm text-amber-700" role="status">
          {aiError}
        </p>
      ) : null}

      {showAiLabel ? (
        <p
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700"
          data-testid="ai-results-label"
        >
          ✨ AI-powered results
        </p>
      ) : null}

      {loading ? (
        <CardSkeletonGrid />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => void loadProducts()} />
      ) : showAiSpinner ? (
        <Spinner label="Searching…" />
      ) : visibleProducts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          No products match your search.
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="product-grid"
        >
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
