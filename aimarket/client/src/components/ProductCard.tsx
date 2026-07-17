import { Link } from 'react-router-dom';
import type { ProductSummary } from '../types';
import { formatPrice } from '../format';
import { StarRating } from './StarRating';

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="18">No image</text></svg>',
  );

export function ProductCard({ product }: { product: ProductSummary }) {
  const outOfStock = product.inventory <= 0;

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500"
      data-testid="product-card"
    >
      <div className="relative h-48 w-full overflow-hidden bg-slate-100">
        <img
          src={product.imageUrl || PLACEHOLDER}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-105"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
          }}
        />
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-brand-700 shadow-sm">
          {product.category}
        </span>
        {outOfStock ? (
          <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900" title={product.name}>
          {product.name}
        </h3>
        <p className="line-clamp-2 flex-1 text-sm text-slate-500">
          {product.shortDescription}
        </p>
        <StarRating rating={product.rating} reviewCount={product.reviewCount} />
        <div className="mt-1 text-lg font-bold text-slate-900">
          {formatPrice(product.price)}
        </div>
      </div>
    </Link>
  );
}
