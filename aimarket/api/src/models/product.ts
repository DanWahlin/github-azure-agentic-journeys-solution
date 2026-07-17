import type { FieldError } from '../errors.js';
import {
  Validator,
  isStringInRange,
  isValidPrice,
  isInteger,
  isValidImageUrl,
  isNonEmptyString,
} from './validation.js';

export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Clothing',
  'Home',
  'Sports',
  'Books',
  'Toys',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface Product {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  price: number;
  category: ProductCategory;
  tags: string[];
  inventory: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  sellerId: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

/** Fields returned in list responses (subset of the full product). */
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

export interface CreateProductInput {
  name: string;
  description: string;
  shortDescription: string;
  price: number;
  category: ProductCategory;
  tags?: string[];
  inventory: number;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  sellerId: string;
  status?: ProductStatus;
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, 'sellerId'>>;

function validateTags(tags: unknown, v: Validator): void {
  if (tags === undefined) return;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) {
    v.add('tags', 'Tags must be an array of strings');
  }
}

function validateRating(rating: unknown, v: Validator): void {
  if (rating === undefined) return;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5) {
    v.add('rating', 'Rating must be a number between 0 and 5');
  }
}

/** Validate the payload for creating a product. */
export function validateCreateProduct(input: unknown): FieldError[] {
  const v = new Validator();
  if (typeof input !== 'object' || input === null) {
    v.add('body', 'Request body must be a JSON object');
    return v.errors;
  }
  const p = input as Record<string, unknown>;

  if (!isStringInRange(p.name, 1, 200)) v.add('name', 'Name must be 1-200 characters');
  if (!isStringInRange(p.description, 1, 2000))
    v.add('description', 'Description must be 1-2000 characters');
  if (!isStringInRange(p.shortDescription, 1, 200))
    v.add('shortDescription', 'Short description must be 1-200 characters');

  if (!isValidPrice(p.price)) {
    v.add('price', 'Price must be greater than 0 with at most two decimal places');
  }

  if (!isNonEmptyString(p.category) || !PRODUCT_CATEGORIES.includes(p.category as ProductCategory)) {
    v.add('category', `Category must be one of: ${PRODUCT_CATEGORIES.join(', ')}`);
  }

  validateTags(p.tags, v);

  if (!isInteger(p.inventory) || (p.inventory as number) < 0) {
    v.add('inventory', 'Inventory must be an integer >= 0');
  }

  validateRating(p.rating, v);

  if (p.reviewCount !== undefined && (!isInteger(p.reviewCount) || (p.reviewCount as number) < 0)) {
    v.add('reviewCount', 'Review count must be an integer >= 0');
  }

  if (p.imageUrl !== undefined && !isValidImageUrl(p.imageUrl)) {
    v.add('imageUrl', 'Image URL must be a valid http(s) URL or an empty string');
  }

  if (!isNonEmptyString(p.sellerId)) v.add('sellerId', 'sellerId is required');

  if (p.status !== undefined && !PRODUCT_STATUSES.includes(p.status as ProductStatus)) {
    v.add('status', `Status must be one of: ${PRODUCT_STATUSES.join(', ')}`);
  }

  return v.errors;
}

/** Validate a partial product update. Only provided fields are checked. */
export function validateUpdateProduct(input: unknown): FieldError[] {
  const v = new Validator();
  if (typeof input !== 'object' || input === null) {
    v.add('body', 'Request body must be a JSON object');
    return v.errors;
  }
  const p = input as Record<string, unknown>;

  if (p.name !== undefined && !isStringInRange(p.name, 1, 200))
    v.add('name', 'Name must be 1-200 characters');
  if (p.description !== undefined && !isStringInRange(p.description, 1, 2000))
    v.add('description', 'Description must be 1-2000 characters');
  if (p.shortDescription !== undefined && !isStringInRange(p.shortDescription, 1, 200))
    v.add('shortDescription', 'Short description must be 1-200 characters');
  if (p.price !== undefined && !isValidPrice(p.price))
    v.add('price', 'Price must be greater than 0 with at most two decimal places');
  if (
    p.category !== undefined &&
    (!isNonEmptyString(p.category) || !PRODUCT_CATEGORIES.includes(p.category as ProductCategory))
  ) {
    v.add('category', `Category must be one of: ${PRODUCT_CATEGORIES.join(', ')}`);
  }
  validateTags(p.tags, v);
  if (p.inventory !== undefined && (!isInteger(p.inventory) || (p.inventory as number) < 0))
    v.add('inventory', 'Inventory must be an integer >= 0');
  validateRating(p.rating, v);
  if (p.reviewCount !== undefined && (!isInteger(p.reviewCount) || (p.reviewCount as number) < 0))
    v.add('reviewCount', 'Review count must be an integer >= 0');
  if (p.imageUrl !== undefined && !isValidImageUrl(p.imageUrl))
    v.add('imageUrl', 'Image URL must be a valid http(s) URL or an empty string');
  if (p.status !== undefined && !PRODUCT_STATUSES.includes(p.status as ProductStatus))
    v.add('status', `Status must be one of: ${PRODUCT_STATUSES.join(', ')}`);

  return v.errors;
}

/** Project a full product down to the list-response summary shape. */
export function toProductSummary(p: Product): ProductSummary {
  return {
    id: p.id,
    name: p.name,
    shortDescription: p.shortDescription,
    price: p.price,
    category: p.category,
    tags: p.tags,
    inventory: p.inventory,
    rating: p.rating,
    reviewCount: p.reviewCount,
    imageUrl: p.imageUrl,
    status: p.status,
  };
}
