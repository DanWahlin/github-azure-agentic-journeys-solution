import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ProductSummary } from '../types';

const placeOrder = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, placeOrder: (...args: unknown[]) => placeOrder(...args) };
});

import { CartProvider, useCart } from '../context/CartContext';
import { Cart } from '../pages/Cart';

const PRODUCT: ProductSummary = {
  id: 'prod-1',
  name: 'UltraBook Pro 15',
  shortDescription: 'short',
  price: 100,
  category: 'Electronics',
  tags: [],
  inventory: 5,
  rating: 4,
  reviewCount: 1,
  imageUrl: 'https://example.com/x.jpg',
  status: 'active',
};

function Seed({ quantity }: { quantity: number }) {
  const { addItem } = useCart();
  useEffect(() => {
    addItem(PRODUCT, quantity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderCart(quantity = 2) {
  return render(
    <MemoryRouter>
      <CartProvider>
        <Seed quantity={quantity} />
        <Cart />
      </CartProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('Cart page', () => {
  it('renders the empty state when there are no items', () => {
    render(
      <MemoryRouter>
        <CartProvider>
          <Cart />
        </CartProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });

  it('shows line items, item count and subtotal', async () => {
    renderCart(2);
    await waitFor(() => expect(screen.getByTestId('summary-count')).toHaveTextContent('2'));
    expect(screen.getByTestId('summary-subtotal')).toHaveTextContent('$200.00');
  });

  it('places an order with the demo user and shows the confirmation with order ID', async () => {
    placeOrder.mockResolvedValue({ id: 'order-123', total: 200, status: 'pending' });
    renderCart(2);

    await userEvent.click(await screen.findByRole('button', { name: 'Place Order' }));

    await waitFor(() => expect(screen.getByTestId('order-id')).toHaveTextContent('order-123'));

    const payload = placeOrder.mock.calls[0][0];
    expect(payload).toMatchObject({
      userId: 'user-buyer-1',
      items: [{ productId: 'prod-1', quantity: 2 }],
    });
    expect(payload.shippingAddress).toMatchObject({ city: 'Seattle', country: 'US' });
  });

  it('shows an error message when placing the order fails', async () => {
    const { ApiError } = await vi.importActual<typeof import('../api')>('../api');
    placeOrder.mockRejectedValue(new ApiError(400, 'INSUFFICIENT_INVENTORY', 'Not enough stock'));
    renderCart(2);

    await userEvent.click(await screen.findByRole('button', { name: 'Place Order' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not enough stock'));
  });
});
