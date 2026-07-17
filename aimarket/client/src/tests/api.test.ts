import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getProduct, getProducts, placeOrder, searchProducts, sendChatMessage } from '../api';
import type { ChatMessage, CreateOrderRequest } from '../types';

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    text: () => Promise.resolve(text),
  } as unknown as Response);
}

describe('api client', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('requests the products list without the /api prefix in the path', async () => {
    const fetchMock = mockFetch(200, {
      data: [],
      page: 1,
      pageSize: 100,
      totalCount: 0,
      totalPages: 1,
    });
    globalThis.fetch = fetchMock;

    await getProducts();

    const url = fetchMock.mock.calls[0][0] as string;
    // API_BASE defaults to /api; the endpoint path must not double it.
    expect(url).toMatch(/\/api\/products(\?|$)/);
    expect(url).not.toMatch(/\/api\/api/);
  });

  it('passes the category filter as a query parameter and omits "All"', async () => {
    const fetchMock = mockFetch(200, {
      data: [],
      page: 1,
      pageSize: 100,
      totalCount: 0,
      totalPages: 1,
    });
    globalThis.fetch = fetchMock;

    await getProducts({ category: 'Electronics' });
    expect(fetchMock.mock.calls[0][0]).toContain('category=Electronics');

    await getProducts({ category: 'All' });
    expect(fetchMock.mock.calls[1][0]).not.toContain('category=');
  });

  it('POSTs a JSON body with content-type when placing an order', async () => {
    const fetchMock = mockFetch(201, { id: 'order-x', total: 10, status: 'pending' });
    globalThis.fetch = fetchMock;

    const order: CreateOrderRequest = {
      userId: 'user-buyer-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
      shippingAddress: {
        street: '1 St',
        city: 'C',
        state: 'S',
        zip: '00000',
        country: 'US',
      },
    };
    const result = await placeOrder(order);

    expect(result.id).toBe('order-x');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(order);
  });

  it('sends the query to the search endpoint and returns the data array', async () => {
    const fetchMock = mockFetch(200, {
      data: [{ id: 'prod-6', name: 'Ceramic Pour-Over Set', score: 0.91 }],
      query: 'coffee',
      count: 1,
    });
    globalThis.fetch = fetchMock;

    const results = await searchProducts('coffee');
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.91);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ query: 'coffee' });
  });

  it('posts message history to /chat and returns the assistant content', async () => {
    const fetchMock = mockFetch(200, {
      role: 'assistant',
      content: 'We have the UltraBook Pro 15.',
    });
    globalThis.fetch = fetchMock;

    const messages: ChatMessage[] = [{ role: 'user', content: 'laptops?' }];
    const reply = await sendChatMessage(messages);

    expect(reply).toBe('We have the UltraBook Pro 15.');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/api\/chat$/);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ messages });
  });

  it('propagates a 503 from /chat as a typed ApiError', async () => {
    globalThis.fetch = mockFetch(503, {
      error: { code: 'INTERNAL_ERROR', message: 'not configured' },
    });
    await expect(sendChatMessage([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      status: 503,
      code: 'INTERNAL_ERROR',
    });
  });

  it('throws a typed ApiError carrying the envelope code on non-2xx', async () => {
    globalThis.fetch = mockFetch(404, {
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    });

    await expect(getProduct('missing')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(getProduct('missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('wraps network failures as a NETWORK_ERROR ApiError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(getProducts()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
