import { Router } from 'express';
import type { DataStore } from '../data/interfaces.js';
import type { Product } from '../models/product.js';
import { AppError } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  buildSystemPrompt,
  isGpt5Family,
  type ChatCompletionClient,
  type ChatMessage,
} from '../ai/chat.js';

const MAX_TOKENS = 500;
const CHAT_ROLES = new Set(['user', 'assistant', 'system']);

/** Compact catalog projection injected into the system prompt. */
function toCatalogEntry(p: Product) {
  return {
    id: p.id,
    name: p.name,
    shortDescription: p.shortDescription,
    price: p.price,
    category: p.category,
    rating: p.rating,
    tags: p.tags,
    inventory: p.inventory,
  };
}

/** Validate the incoming message history and normalize to ChatMessage[]. */
function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw AppError.validation([
      { field: 'messages', message: 'messages must be a non-empty array' },
    ]);
  }
  return raw.map((m, i) => {
    const msg = (m ?? {}) as Record<string, unknown>;
    const role = msg.role;
    const content = msg.content;
    if (typeof role !== 'string' || !CHAT_ROLES.has(role)) {
      throw AppError.validation([
        { field: `messages[${i}].role`, message: 'role must be "user", "assistant", or "system"' },
      ]);
    }
    if (typeof content !== 'string' || content.trim() === '') {
      throw AppError.validation([
        { field: `messages[${i}].content`, message: 'content must be a non-empty string' },
      ]);
    }
    return { role: role as ChatMessage['role'], content };
  });
}

/**
 * AI shopping assistant backed by Microsoft Foundry (Azure OpenAI).
 *
 * When no chat client is configured (no `AZURE_OPENAI_ENDPOINT` locally), the
 * endpoint returns 503 with an actionable message so the frontend can show a
 * graceful state. When configured, it injects the live catalog into the system
 * prompt and forwards the full message history.
 */
export function createChatRouter(
  store: DataStore,
  chatClient: ChatCompletionClient | null = null,
  deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5-mini',
): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const messages = parseMessages(body.messages);

      if (!chatClient) {
        throw new AppError(
          503,
          'INTERNAL_ERROR',
          'The shopping assistant is not configured. Set AZURE_OPENAI_ENDPOINT (and a key or managed identity) to enable it (provisioned in Phase 4).',
        );
      }

      // Inject the live catalog so the model only recommends real products.
      const { data: products } = await store.products.getAll({
        page: 1,
        pageSize: 10000,
        status: 'active',
      });
      const catalogJson = JSON.stringify(products.map(toCatalogEntry));
      const systemPrompt = buildSystemPrompt(catalogJson);

      const fullMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      // gpt-5 family rejects custom temperature; only the gpt-4.1 fallback uses 0.7.
      const temperature = isGpt5Family(deployment) ? undefined : 0.7;

      let content: string;
      try {
        content = await chatClient.complete(fullMessages, {
          maxTokens: MAX_TOKENS,
          temperature,
        });
      } catch (err) {
        // Never leak credentials or raw provider errors to the client.
        const detail = err instanceof Error ? err.message : 'unknown error';
        console.error('Chat completion failed:', detail);
        throw new AppError(
          502,
          'INTERNAL_ERROR',
          'The shopping assistant is temporarily unavailable. Please try again in a moment.',
        );
      }

      res.json({ role: 'assistant', content });
    }),
  );

  return router;
}
