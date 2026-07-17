/**
 * AI services container injected into the Express app. Built from environment
 * config by `buildAiServices`, or constructed directly with fakes in tests.
 * `search`/`chat` are `null` when the corresponding credentials are absent, in
 * which case the routes use their graceful local fallbacks.
 */
import { loadAiConfig } from './config.js';
import { buildSearchProvider, type ProductSearchProvider } from './search.js';
import { buildChatClient, type ChatCompletionClient } from './chat.js';

export interface AiServices {
  search: ProductSearchProvider | null;
  chat: ChatCompletionClient | null;
}

export async function buildAiServices(
  env: Record<string, string | undefined> = process.env,
): Promise<AiServices> {
  const config = loadAiConfig(env);
  const [search, chat] = await Promise.all([
    buildSearchProvider(config.search),
    buildChatClient(config.chat),
  ]);
  return { search, chat };
}

export type { ProductSearchProvider, ChatCompletionClient };
