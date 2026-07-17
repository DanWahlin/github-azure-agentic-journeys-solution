import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ProductSummary } from '../types';

const getProducts = vi.fn();
const searchProducts = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getProducts: (...args: unknown[]) => getProducts(...args),
    searchProducts: (...args: unknown[]) => searchProducts(...args),
  };
});

import { ProductGrid } from '../pages/ProductGrid';

function summary(overrides: Partial<ProductSummary>): ProductSummary {
  return {
    id: 'prod-x',
    name: 'Product',
    shortDescription: 'desc',
    price: 9.99,
    category: 'Electronics',
    tags: [],
    inventory: 5,
    rating: 4,
    reviewCount: 1,
    imageUrl: 'https://example.com/x.jpg',
    status: 'active',
    ...overrides,
  };
}

const SAMPLE: ProductSummary[] = [
  summary({ id: 'prod-1', name: 'UltraBook Pro 15', category: 'Electronics', tags: ['laptop'] }),
  summary({ id: 'prod-6', name: 'Ceramic Pour-Over Set', category: 'Home', tags: ['coffee'] }),
];

function renderGrid() {
  return render(
    <MemoryRouter>
      <ProductGrid />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProductGrid', () => {
  it('shows a loading skeleton then renders product cards from the API', async () => {
    getProducts.mockResolvedValue({
      data: SAMPLE,
      page: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
    });

    renderGrid();
    expect(screen.getByTestId('skeleton-grid')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('product-grid')).toBeInTheDocument());
    expect(screen.getByText('UltraBook Pro 15')).toBeInTheDocument();
    expect(screen.getByText('Ceramic Pour-Over Set')).toBeInTheDocument();
  });

  it('reloads with a category filter when a category button is clicked', async () => {
    getProducts.mockResolvedValue({
      data: SAMPLE,
      page: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
    });
    renderGrid();
    await waitFor(() => expect(screen.getByTestId('product-grid')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Electronics' }));

    await waitFor(() =>
      expect(getProducts).toHaveBeenLastCalledWith({ category: 'Electronics' }),
    );
  });

  it('filters client-side by name as the user types (plain search)', async () => {
    getProducts.mockResolvedValue({
      data: SAMPLE,
      page: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
    });
    renderGrid();
    await waitFor(() => expect(screen.getByTestId('product-grid')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Search products'), 'ceramic');

    await waitFor(() => {
      const grid = screen.getByTestId('product-grid');
      expect(within(grid).queryByText('UltraBook Pro 15')).not.toBeInTheDocument();
      expect(within(grid).getByText('Ceramic Pour-Over Set')).toBeInTheDocument();
    });
  });

  it('calls the semantic search API when AI Search is enabled', async () => {
    getProducts.mockResolvedValue({
      data: SAMPLE,
      page: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
    });
    searchProducts.mockResolvedValue([SAMPLE[1]]);

    renderGrid();
    await waitFor(() => expect(screen.getByTestId('product-grid')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('Enable AI search'));
    await userEvent.type(screen.getByLabelText('Search products'), 'gift for coffee lover');

    await waitFor(() => expect(searchProducts).toHaveBeenCalledWith('gift for coffee lover'));
    await waitFor(() =>
      expect(screen.getByText('Ceramic Pour-Over Set')).toBeInTheDocument(),
    );
    // The semantic-search results carry an "AI-powered results" label.
    expect(screen.getByTestId('ai-results-label')).toBeInTheDocument();
  });

  it('shows an error state with retry when the API fails', async () => {
    getProducts.mockRejectedValueOnce(new Error('down'));
    renderGrid();
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
  });
});
