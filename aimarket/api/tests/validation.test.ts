import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isValidPrice, roundToCents, isValidEmail, isValidImageUrl } from '../src/models/validation.ts';
import { validateCreateProduct } from '../src/models/product.ts';
import { validateCreateOrder } from '../src/models/order.ts';
import { validateCreateUser } from '../src/models/user.ts';

test('isValidPrice accepts valid two-decimal prices', () => {
  assert.equal(isValidPrice(64.99), true);
  assert.equal(isValidPrice(0.1), true);
  assert.equal(isValidPrice(1299.99), true);
  assert.equal(isValidPrice(100), true);
  assert.equal(isValidPrice(0.01), true);
});

test('isValidPrice rejects >2 decimals, non-positive, and non-finite values', () => {
  assert.equal(isValidPrice(64.991), false);
  assert.equal(isValidPrice(0), false);
  assert.equal(isValidPrice(-5), false);
  assert.equal(isValidPrice(Number.NaN), false);
  assert.equal(isValidPrice(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidPrice(Number.NEGATIVE_INFINITY), false);
  assert.equal(isValidPrice('64.99'), false);
  assert.equal(isValidPrice(undefined), false);
});

test('roundToCents normalizes to two decimals', () => {
  assert.equal(roundToCents(1299.99 * 1 + 45.99 * 2), 1391.97);
  assert.equal(roundToCents(0.1 + 0.2), 0.3);
});

test('isValidEmail basic checks', () => {
  assert.equal(isValidEmail('alex@example.com'), true);
  assert.equal(isValidEmail('bad'), false);
  assert.equal(isValidEmail('bad@'), false);
  assert.equal(isValidEmail('a@b'), false);
});

test('isValidImageUrl accepts empty and http(s), rejects others', () => {
  assert.equal(isValidImageUrl(''), true);
  assert.equal(isValidImageUrl('https://images.unsplash.com/photo-1?w=400'), true);
  assert.equal(isValidImageUrl('ftp://x/y'), false);
  assert.equal(isValidImageUrl('not a url'), false);
});

test('validateCreateProduct flags invalid category and price', () => {
  const errors = validateCreateProduct({
    name: 'X',
    description: 'A valid description that is long enough.',
    shortDescription: 'short',
    price: -1,
    category: 'Gadgets',
    inventory: 5,
    sellerId: 'user-seller-1',
  });
  const fields = errors.map((e) => e.field);
  assert.ok(fields.includes('price'));
  assert.ok(fields.includes('category'));
});

test('validateCreateProduct passes a valid product', () => {
  const errors = validateCreateProduct({
    name: 'Mechanical Keyboard',
    description: 'Cherry MX Brown switches with RGB backlighting and USB-C connection.',
    shortDescription: 'Mechanical keyboard with Cherry MX switches',
    price: 149.99,
    category: 'Electronics',
    tags: ['keyboard'],
    inventory: 50,
    sellerId: 'user-seller-1',
  });
  assert.equal(errors.length, 0);
});

test('validateCreateProduct enforces name and inventory constraints', () => {
  const errors = validateCreateProduct({
    name: '',
    description: '',
    shortDescription: '',
    price: 10,
    category: 'Books',
    inventory: -1,
    sellerId: 's',
  });
  const fields = errors.map((e) => e.field);
  assert.ok(fields.includes('name'));
  assert.ok(fields.includes('description'));
  assert.ok(fields.includes('inventory'));
});

test('validateCreateOrder requires at least one item and full address', () => {
  const errors = validateCreateOrder({ userId: 'u', items: [], shippingAddress: {} });
  const fields = errors.map((e) => e.field);
  assert.ok(fields.includes('items'));
  assert.ok(fields.some((f) => f.startsWith('shippingAddress.')));
});

test('validateCreateOrder accepts a well-formed order', () => {
  const errors = validateCreateOrder({
    userId: 'user-buyer-1',
    items: [{ productId: 'prod-1', quantity: 2 }],
    shippingAddress: {
      street: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      zip: '98101',
      country: 'US',
    },
  });
  assert.equal(errors.length, 0);
});

test('validateCreateUser enforces email and role', () => {
  const errors = validateCreateUser({ email: 'bad', name: 'A', role: 'admin' });
  const fields = errors.map((e) => e.field);
  assert.ok(fields.includes('email'));
  assert.ok(fields.includes('role'));
});
