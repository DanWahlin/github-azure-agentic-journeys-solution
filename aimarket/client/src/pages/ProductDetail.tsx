import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getProduct } from '../api';
import type { Product } from '../types';
import { formatPrice } from '../format';
import { StarRating } from '../components/StarRating';
import { Spinner } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { useCart } from '../context/CartContext';

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="22">No image</text></svg>',
  );

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await getProduct(id);
      setProduct(p);
    } catch (err) {
      const notFound = err instanceof ApiError && err.status === 404;
      setError({
        message:
          err instanceof ApiError ? err.message : 'Failed to load this product.',
        notFound,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Loading product…" />;

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
          &larr; Back to Products
        </Link>
        <ErrorMessage
          title={error.notFound ? 'Product not found' : 'Something went wrong'}
          message={error.message}
          onRetry={error.notFound ? undefined : () => void load()}
        />
      </div>
    );
  }

  if (!product) return null;

  const outOfStock = product.inventory <= 0;
  const maxQty = Math.min(10, product.inventory || 10);

  const handleAdd = () => {
    addItem(product, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-block text-sm font-medium text-brand-600 hover:underline">
        &larr; Back to Products
      </Link>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <img
            src={product.imageUrl || PLACEHOLDER}
            alt={product.name}
            className="h-full max-h-[28rem] w-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
            }}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              {product.category}
            </span>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{product.name}</h1>
          </div>

          <StarRating rating={product.rating} reviewCount={product.reviewCount} size="md" />

          <div className="text-3xl font-bold text-slate-900">{formatPrice(product.price)}</div>

          <p className="text-slate-600">{product.description}</p>

          {product.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="text-sm">
            {outOfStock ? (
              <span className="font-semibold text-red-600">Out of Stock</span>
            ) : (
              <span className="text-emerald-600">
                In stock &middot; {product.inventory} available
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label htmlFor="quantity" className="text-sm font-medium text-slate-700">
              Quantity
            </label>
            <select
              id="quantity"
              value={quantity}
              disabled={outOfStock}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              {Array.from({ length: maxQty }).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn-primary"
              disabled={outOfStock}
              onClick={handleAdd}
            >
              {outOfStock ? 'Out of Stock' : 'Add to Cart'}
            </button>

            {added ? (
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="text-sm font-medium text-brand-600 hover:underline"
                data-testid="added-confirmation"
              >
                Added ✓ — View cart
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
