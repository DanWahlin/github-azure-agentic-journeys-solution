import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { Product, ProductSummary } from '../types';

export interface CartLine {
  product: ProductSummary;
  quantity: number;
}

export interface CartState {
  items: Map<string, CartLine>;
}

type CartAction =
  | { type: 'ADD'; product: ProductSummary; quantity: number }
  | { type: 'SET_QUANTITY'; productId: string; quantity: number }
  | { type: 'REMOVE'; productId: string }
  | { type: 'CLEAR' };

export const MAX_QUANTITY = 10;

function clampQuantity(qty: number, inventory: number): number {
  const cap = Math.min(MAX_QUANTITY, Math.max(0, inventory));
  return Math.max(1, Math.min(qty, cap || MAX_QUANTITY));
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD': {
      const items = new Map(state.items);
      const existing = items.get(action.product.id);
      const nextQty = (existing?.quantity ?? 0) + action.quantity;
      items.set(action.product.id, {
        product: action.product,
        quantity: clampQuantity(nextQty, action.product.inventory),
      });
      return { items };
    }
    case 'SET_QUANTITY': {
      const items = new Map(state.items);
      const existing = items.get(action.productId);
      if (!existing) return state;
      if (action.quantity <= 0) {
        items.delete(action.productId);
        return { items };
      }
      items.set(action.productId, {
        product: existing.product,
        quantity: clampQuantity(action.quantity, existing.product.inventory),
      });
      return { items };
    }
    case 'REMOVE': {
      const items = new Map(state.items);
      items.delete(action.productId);
      return { items };
    }
    case 'CLEAR':
      return { items: new Map() };
    default:
      return state;
  }
}

export interface CartContextValue {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  addItem: (product: Product | ProductSummary, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: new Map() });

  const value = useMemo<CartContextValue>(() => {
    const items = Array.from(state.items.values());
    const itemCount = items.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = items.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
    return {
      items,
      itemCount,
      subtotal,
      addItem: (product, quantity = 1) =>
        dispatch({ type: 'ADD', product, quantity }),
      setQuantity: (productId, quantity) =>
        dispatch({ type: 'SET_QUANTITY', productId, quantity }),
      removeItem: (productId) => dispatch({ type: 'REMOVE', productId }),
      clear: () => dispatch({ type: 'CLEAR' }),
    };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
