import { describe, expect, it } from 'vitest';
import { cartReducer, type CartState } from '../context/CartContext';
import type { ProductSummary } from '../types';

function product(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: 'prod-1',
    name: 'Test Product',
    shortDescription: 'short',
    price: 10,
    category: 'Electronics',
    tags: ['a'],
    inventory: 5,
    rating: 4,
    reviewCount: 2,
    imageUrl: 'https://example.com/img.jpg',
    status: 'active',
    ...overrides,
  };
}

const empty: CartState = { items: new Map() };

describe('cartReducer', () => {
  it('adds a new item', () => {
    const state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 2 });
    expect(state.items.get('prod-1')?.quantity).toBe(2);
  });

  it('accumulates quantity when adding the same product again', () => {
    let state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 2 });
    state = cartReducer(state, { type: 'ADD', product: product(), quantity: 1 });
    expect(state.items.get('prod-1')?.quantity).toBe(3);
  });

  it('caps quantity at available inventory', () => {
    const state = cartReducer(empty, {
      type: 'ADD',
      product: product({ inventory: 3 }),
      quantity: 9,
    });
    expect(state.items.get('prod-1')?.quantity).toBe(3);
  });

  it('caps quantity at MAX_QUANTITY (10) even with high inventory', () => {
    const state = cartReducer(empty, {
      type: 'ADD',
      product: product({ inventory: 100 }),
      quantity: 50,
    });
    expect(state.items.get('prod-1')?.quantity).toBe(10);
  });

  it('removes an item when SET_QUANTITY goes to zero', () => {
    let state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 2 });
    state = cartReducer(state, { type: 'SET_QUANTITY', productId: 'prod-1', quantity: 0 });
    expect(state.items.has('prod-1')).toBe(false);
  });

  it('updates quantity with SET_QUANTITY', () => {
    let state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 2 });
    state = cartReducer(state, { type: 'SET_QUANTITY', productId: 'prod-1', quantity: 4 });
    expect(state.items.get('prod-1')?.quantity).toBe(4);
  });

  it('removes an item with REMOVE', () => {
    let state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 2 });
    state = cartReducer(state, { type: 'REMOVE', productId: 'prod-1' });
    expect(state.items.size).toBe(0);
  });

  it('clears the cart with CLEAR', () => {
    let state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 2 });
    state = cartReducer(state, { type: 'ADD', product: product({ id: 'prod-2' }), quantity: 1 });
    state = cartReducer(state, { type: 'CLEAR' });
    expect(state.items.size).toBe(0);
  });

  it('does not mutate the previous state (immutability)', () => {
    const state = cartReducer(empty, { type: 'ADD', product: product(), quantity: 1 });
    expect(empty.items.size).toBe(0);
    expect(state).not.toBe(empty);
  });
});
