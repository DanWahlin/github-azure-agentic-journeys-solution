import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage } from '../types';

const sendChatMessage = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    sendChatMessage: (...args: unknown[]) => sendChatMessage(...args),
  };
});

import { ChatWidget } from '../components/ChatWidget';

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChatWidget (Phase 3 — wired to /api/chat)', () => {
  it('is collapsed by default and expands to the chat panel', async () => {
    render(<ChatWidget />);
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('chat-toggle'));

    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Message the shopping assistant'),
    ).toBeInTheDocument();
  });

  it('sends the full history to the API and renders user + assistant messages', async () => {
    sendChatMessage.mockResolvedValue('We have the UltraBook Pro 15 at $1,299.99 (4.7 stars).');
    render(<ChatWidget />);
    await userEvent.click(screen.getByTestId('chat-toggle'));

    const input = screen.getByLabelText('Message the shopping assistant');
    await userEvent.type(input, 'What laptops do you have?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    // User message renders immediately.
    expect(screen.getByTestId('chat-message-user')).toHaveTextContent(
      'What laptops do you have?',
    );

    // Assistant reply renders after the API resolves.
    await waitFor(() =>
      expect(screen.getByTestId('chat-message-assistant')).toHaveTextContent(
        'UltraBook Pro 15',
      ),
    );

    // The full conversation history (just the one user turn) was posted.
    const sent = sendChatMessage.mock.calls[0][0] as ChatMessage[];
    expect(sent).toEqual([{ role: 'user', content: 'What laptops do you have?' }]);

    // A second turn includes prior history.
    await userEvent.type(input, 'Anything cheaper?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(2));
    const secondSent = sendChatMessage.mock.calls[1][0] as ChatMessage[];
    expect(secondSent).toEqual([
      { role: 'user', content: 'What laptops do you have?' },
      { role: 'assistant', content: 'We have the UltraBook Pro 15 at $1,299.99 (4.7 stars).' },
      { role: 'user', content: 'Anything cheaper?' },
    ]);
  });

  it('shows an actionable message when the assistant is not configured (503)', async () => {
    const { ApiError } = await vi.importActual<typeof import('../api')>('../api');
    sendChatMessage.mockRejectedValue(
      new ApiError(503, 'INTERNAL_ERROR', 'not configured'),
    );
    render(<ChatWidget />);
    await userEvent.click(screen.getByTestId('chat-toggle'));

    await userEvent.type(
      screen.getByLabelText('Message the shopping assistant'),
      'hello',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/not available yet/i),
    );
  });

  it('does not send when the input is empty', async () => {
    render(<ChatWidget />);
    await userEvent.click(screen.getByTestId('chat-toggle'));
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.click(send);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('closes again when the close button is clicked', async () => {
    render(<ChatWidget />);
    await userEvent.click(screen.getByTestId('chat-toggle'));
    const panel = screen.getByTestId('chat-panel');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close assistant' }));
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
  });
});
