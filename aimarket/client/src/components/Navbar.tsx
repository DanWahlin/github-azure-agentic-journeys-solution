import { Link } from 'react-router-dom';
import { CartIcon } from './CartIcon';

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-white">A</span>
          AIMarket
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:inline-block"
          >
            Products
          </Link>
          <CartIcon />
        </nav>
      </div>
    </header>
  );
}
