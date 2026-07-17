import { useEffect, useRef, useState } from 'react';
import { ApiError, sendChatMessage } from '../api';
import type { ChatMessage } from '../types';

/**
 * Floating shopping-assistant widget (Phase 3).
 *
 * Collapsed by default; expands to a 400×500 panel with a message list, a text
 * input, and a send button. On each send it posts the full conversation history
 * to POST /api/chat and appends the assistant reply. Shows a loading indicator
 * while awaiting a reply and an actionable message if the assistant is not
 * configured (503) or otherwise unavailable.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const reply = await sendChatMessage(history);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 503
            ? 'The shopping assistant is not available yet. Please try again later.'
            : err.message
          : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-30">
      {open ? (
        <div
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={{ width: 'min(400px, calc(100vw - 2.5rem))', height: 'min(500px, calc(100vh - 6rem))' }}
          role="dialog"
          aria-label="Shopping assistant"
          data-testid="chat-panel"
        >
          <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
            <span className="font-semibold">Shopping Assistant</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Close assistant"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
            data-testid="chat-messages"
          >
            {messages.length === 0 && !loading ? (
              <div className="m-auto text-center text-sm text-slate-500">
                <div className="mb-1 text-3xl">🤖</div>
                Hi! Ask me about products in the AIMarket catalog.
              </div>
            ) : null}

            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                data-testid={`chat-message-${m.role}`}
              >
                <span
                  className={
                    m.role === 'user'
                      ? 'max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white'
                      : 'max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800'
                  }
                >
                  {m.content}
                </span>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start" data-testid="chat-loading">
                <span className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-500">
                  Thinking…
                </span>
              </div>
            ) : null}

            {error ? (
              <p className="text-center text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products…"
              aria-label="Message the shopping assistant"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || input.trim() === ''}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          aria-label="Open shopping assistant"
          data-testid="chat-toggle"
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
