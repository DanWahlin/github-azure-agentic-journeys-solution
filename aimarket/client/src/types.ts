// Shared types mirroring the AIMarket API contract (see api/ and PLAN.md).

export type ProductCategory =
  | 'Electronics'
  | 'Clothing'
  | 'Home'
  | 'Sports'
  | 'Books'
  | 'Toys';

export type ProductStatus = 'draft' | 'active' | 'archived';

/** Summary shape returned by list/search endpoints (no description/sellerId). */
export interface ProductSummary {
  id: string;
  name: string;
  shortDescription: string;
  price: number;
  category: ProductCategory;
  tags: string[];
  inventory: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  status: ProductStatus;
}

/** Full product returned by GET /products/:id. */
export interface Product extends ProductSummary {
  description: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SearchResponse<T> {
  data: T[];
  query: string;
  count: number;
}

/** Search-result item: a product summary plus a 0–1 relevance score. */
export interface SearchResult extends ProductSummary {
  score: number;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderRequest {
  userId: string;
  items: OrderItemInput[];
  shippingAddress: ShippingAddress;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  priceAtPurchase: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Error envelope returned by the API: { error: { code, message, details? } }. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export const CATEGORIES: readonly ProductCategory[] = [
  'Electronics',
  'Clothing',
  'Home',
  'Sports',
  'Books',
  'Toys',
] as const;
