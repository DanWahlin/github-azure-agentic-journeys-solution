import type {
  ChatMessage,
  CreateOrderRequest,
  Order,
  PaginatedResponse,
  Product,
  ProductSummary,
  SearchResponse,
  SearchResult,
} from './types';

// Endpoint paths below do NOT include the /api prefix — that is part of
// API_BASE. In dev, VITE_API_URL is usually unset and the Vite proxy maps
// /api -> the API server. In production, VITE_API_URL is the full base
// including /api (e.g. https://ca-api-xxx.azurecontainerapps.io/api).
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || '/api';

/** Error thrown for any non-2xx API response, carrying the parsed envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(joinUrl(API_BASE, path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Could not reach the API. ${(err as Error).message}`,
    );
  }

  const text = await res.text();
  const body = text ? safeParse(text) : undefined;

  if (!res.ok) {
    const envelope = body as { error?: { code?: string; message?: string } } | undefined;
    const code = envelope?.error?.code ?? 'INTERNAL_ERROR';
    const message =
      envelope?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, code, message);
  }

  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function getProducts(params?: {
  category?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ProductSummary>> {
  const q = new URLSearchParams();
  if (params?.category && params.category !== 'All') q.set('category', params.category);
  if (params?.page) q.set('page', String(params.page));
  q.set('pageSize', String(params?.pageSize ?? 100));
  const qs = q.toString();
  return request<PaginatedResponse<ProductSummary>>(`/products${qs ? `?${qs}` : ''}`);
}

export async function getProduct(id: string): Promise<Product> {
  return request<Product>(`/products/${encodeURIComponent(id)}`);
}

/**
 * Semantic product search. Posts { query } to POST /products/search, which is
 * backed by Azure AI Search semantic ranking when configured (Phase 3/4) and a
 * SQLite LIKE fallback otherwise — the request/response contract is identical
 * either way. Returns ranked results (each carrying a 0–1 `score`).
 */
export async function searchProducts(query: string): Promise<SearchResult[]> {
  const res = await request<SearchResponse<SearchResult>>('/products/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  return res.data;
}

export async function placeOrder(order: CreateOrderRequest): Promise<Order> {
  return request<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

/**
 * Shopping assistant. Sends the full message history to POST /api/chat and
 * returns the assistant's reply text. The API responds with { role, content }.
 * Throws an ApiError (e.g. 503) when the assistant is not configured.
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const res = await request<{ role?: string; content?: string }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
  return res.content ?? '';
}
