import type { FieldError } from '../errors.js';
import { Validator, isNonEmptyString, isInteger } from './validation.js';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status transitions. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export interface OrderItem {
  productId: string;
  quantity: number;
  priceAtPurchase: number;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  createdAt: string;
}

/** Item as supplied by a client placing an order (price is set server-side). */
export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  userId: string;
  items: OrderItemInput[];
  shippingAddress: ShippingAddress;
}

const ADDRESS_FIELDS: (keyof ShippingAddress)[] = ['street', 'city', 'state', 'zip', 'country'];

function validateShippingAddress(address: unknown, v: Validator): void {
  if (typeof address !== 'object' || address === null) {
    v.add('shippingAddress', 'shippingAddress is required');
    return;
  }
  const a = address as Record<string, unknown>;
  for (const field of ADDRESS_FIELDS) {
    if (!isNonEmptyString(a[field])) {
      v.add(`shippingAddress.${field}`, `shippingAddress.${field} is required`);
    }
  }
}

/** Validate the shape of an order-creation request (not business rules). */
export function validateCreateOrder(input: unknown): FieldError[] {
  const v = new Validator();
  if (typeof input !== 'object' || input === null) {
    v.add('body', 'Request body must be a JSON object');
    return v.errors;
  }
  const o = input as Record<string, unknown>;

  if (!isNonEmptyString(o.userId)) v.add('userId', 'userId is required');

  if (!Array.isArray(o.items) || o.items.length === 0) {
    v.add('items', 'items must contain at least 1 item');
  } else {
    o.items.forEach((item, i) => {
      if (typeof item !== 'object' || item === null) {
        v.add(`items[${i}]`, 'Each item must be an object');
        return;
      }
      const it = item as Record<string, unknown>;
      if (!isNonEmptyString(it.productId)) v.add(`items[${i}].productId`, 'productId is required');
      if (!isInteger(it.quantity) || (it.quantity as number) < 1) {
        v.add(`items[${i}].quantity`, 'quantity must be an integer >= 1');
      }
    });
  }

  validateShippingAddress(o.shippingAddress, v);

  return v.errors;
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
