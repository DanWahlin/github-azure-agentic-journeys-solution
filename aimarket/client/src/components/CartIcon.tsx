import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export function CartIcon() {
  const { itemCount } = useCart();
  return (
    <Link
      to="/cart"
      className="relative inline-flex items-center rounded-md p-2 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
      aria-label={`Cart with ${itemCount} item${itemCount === 1 ? '' : 's'}`}
    >
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.5l1.5 12.75h12l1.5-9H5.25" />
        <circle cx="9" cy="19.5" r="1.25" fill="currentColor" />
        <circle cx="17" cy="19.5" r="1.25" fill="currentColor" />
      </svg>
      {itemCount > 0 ? (
        <span
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white"
          data-testid="cart-badge"
        >
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
