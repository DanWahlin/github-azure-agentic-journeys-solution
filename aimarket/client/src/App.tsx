import { Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ChatWidget } from './components/ChatWidget';
import { ProductGrid } from './pages/ProductGrid';
import { ProductDetail } from './pages/ProductDetail';
import { Cart } from './pages/Cart';

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Routes>
          <Route path="/" element={<ProductGrid />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route
            path="*"
            element={
              <div className="py-16 text-center text-slate-500">Page not found.</div>
            }
          />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        AIMarket — demo storefront
      </footer>
      <ChatWidget />
    </div>
  );
}

export default App;
