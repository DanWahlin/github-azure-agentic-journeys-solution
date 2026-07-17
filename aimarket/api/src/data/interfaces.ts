import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductStatus,
} from '../models/product.js';
import type { Order, CreateOrderInput } from '../models/order.js';
import type { User, CreateUserInput } from '../models/user.js';

export interface ProductListParams {
  page: number;
  pageSize: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
}

export interface ProductSearchFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface IProductRepository {
  getAll(params: ProductListParams): Promise<{ data: Product[]; totalCount: number }>;
  getById(id: string): Promise<Product | null>;
  create(input: CreateProductInput): Promise<Product>;
  update(id: string, fields: UpdateProductInput): Promise<Product | null>;
  search(query: string, filters?: ProductSearchFilters): Promise<Product[]>;
}

export interface IOrderRepository {
  /**
   * Atomically place an order: validate product existence/active status and
   * inventory, capture priceAtPurchase from current product prices, decrement
   * inventory, compute total, and persist. Throws AppError on business-rule
   * violations.
   */
  create(input: CreateOrderInput): Promise<Order>;
  getById(id: string): Promise<Order | null>;
  getByUserId(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: Order[]; totalCount: number }>;
}

export interface IUserRepository {
  create(input: CreateUserInput): Promise<User>;
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
}

export interface DataStore {
  products: IProductRepository;
  orders: IOrderRepository;
  users: IUserRepository;
  close?(): void;
}

// Re-export for convenience.
export type { Product, CreateProductInput, UpdateProductInput, ProductStatus };
export type { Order, CreateOrderInput };
export type { User, CreateUserInput };
