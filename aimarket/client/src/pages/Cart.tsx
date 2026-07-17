import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, placeOrder } from '../api';
import type { CreateOrderRequest, Order } from '../types';
import { formatPrice } from '../format';
import { useCart } from '../context/CartContext';

// Phase 2 uses a fixed demo buyer and shipping address (no auth/checkout yet).
const DEMO_USER_ID = 'user-buyer-1';
const DEMO_SHIPPING_ADDRESS = {
  street: '123 Main St',
  city: 'Seattle',
  state: 'WA',
  zip: '98101',
  country: 'US',
};

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#e2e8f0"/></svg>',
  );

export function Cart() {
  const { items, itemCount, subtotal, setQuantity, removeItem, clear } = useCart();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const handlePlaceOrder = async () => {
    setPlacing(true);
    setError(null);
    const payload: CreateOrderRequest = {
      userId: DEMO_USER_ID,
      items: items.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
      })),
      shippingAddress: DEMO_SHIPPING_ADDRESS,
    };
    try {
      const order = await placeOrder(payload);
      setConfirmedOrder(order);
      clear();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to place the order.');
    } finally {
      setPlacing(false);
    }
  };

  if (confirmedOrder) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 text-2xl font-bold text-emerald-800">Order placed!</h1>
        <p className="mt-2 text-sm text-emerald-700">
          Thank you for your order. Your order ID is{' '}
          <span className="font-mono font-semibold" data-testid="order-id">
            {confirmedOrder.id}
          </span>
          .
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          Total charged: {formatPrice(confirmedOrder.total)}
        </p>
        <Link to="/" className="btn-primary mt-6">
          Continue shopping
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="text-4xl">🛒</div>
        <h1 className="mt-3 text-xl font-semibold text-slate-800">Your cart is empty</h1>
        <p className="mt-2 text-sm text-slate-500">
          Browse the catalog to find something you like.
        </p>
        <Link to="/" className="btn-primary mt-6">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Your cart</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <ul className="space-y-4 lg:col-span-2" data-testid="cart-items">
          {items.map((line) => (
            <li
              key={line.product.id}
              className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4"
            >
              <img
                src={line.product.imageUrl || PLACEHOLDER}
                alt={line.product.name}
                className="h-16 w-16 rounded-md object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
                }}
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/products/${line.product.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {line.product.name}
                </Link>
                <div className="text-sm text-slate-500">{formatPrice(line.product.price)} each</div>
              </div>

              <label className="sr-only" htmlFor={`qty-${line.product.id}`}>
                Quantity for {line.product.name}
              </label>
              <select
                id={`qty-${line.product.id}`}
                value={line.quantity}
                onChange={(e) => setQuantity(line.product.id, Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {Array.from({ length: Math.min(10, line.product.inventory || 10) }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>

              <div className="w-24 text-right font-semibold text-slate-900">
                {formatPrice(line.product.price * line.quantity)}
              </div>

              <button
                type="button"
                onClick={() => removeItem(line.product.id)}
                className="text-sm font-medium text-red-600 hover:underline"
                aria-label={`Remove ${line.product.name} from cart`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Items</dt>
              <dd className="font-medium text-slate-900" data-testid="summary-count">
                {itemCount}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-medium text-slate-900" data-testid="summary-subtotal">
                {formatPrice(subtotal)}
              </dd>
            </div>
          </dl>

          {error ? (
            <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            className="btn-primary mt-6 w-full"
            onClick={() => void handlePlaceOrder()}
            disabled={placing}
          >
            {placing ? 'Placing order…' : 'Place Order'}
          </button>
          <Link
            to="/"
            className="mt-3 block text-center text-sm font-medium text-slate-500 hover:underline"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
