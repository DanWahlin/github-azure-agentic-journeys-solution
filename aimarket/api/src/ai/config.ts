/**
 * AI configuration derived from environment variables (Phase 3).
 *
 * Secrets are never logged. Callers only receive booleans / opaque config and
 * must not print `key` values. When credentials are absent, the API degrades
 * gracefully: semantic search falls back to SQLite LIKE queries and the chat
 * endpoint returns 503.
 *
 * Phase 4 wires these values into Container Apps. Azure AI Search uses an admin
 * key (from `listAdminKeys()`); Microsoft Foundry authenticates with the API
 * container app's managed identity (no key) — see `buildChatClient`.
 */
export interface SearchConfig {
  endpoint: string;
  key: string;
  indexName: string;
  semanticConfiguration: string;
}

export interface ChatConfig {
  endpoint: string;
  /** Optional. When absent, managed identity (DefaultAzureCredential) is used. */
  key: string;
  deployment: string;
  apiVersion: string;
}

export interface AiConfig {
  search: SearchConfig | null;
  chat: ChatConfig | null;
}

const DEFAULT_INDEX = 'aimarket-products';
const DEFAULT_SEMANTIC_CONFIG = 'aimarket-semantic';
const DEFAULT_DEPLOYMENT = 'gpt-5-mini';
const DEFAULT_API_VERSION = '2024-10-21';

type Env = Record<string, string | undefined>;

function trimmed(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read Azure AI Search config. Configured only when both an endpoint and an
 * admin/query key are present — locally you supply both to exercise the real
 * adapter; otherwise the LIKE fallback is used.
 */
export function loadSearchConfig(env: Env = process.env): SearchConfig | null {
  const endpoint = trimmed(env.AZURE_SEARCH_ENDPOINT);
  const key = trimmed(env.AZURE_SEARCH_KEY);
  if (!endpoint || !key) return null;
  return {
    endpoint,
    key,
    indexName: trimmed(env.AZURE_SEARCH_INDEX) || DEFAULT_INDEX,
    semanticConfiguration:
      trimmed(env.AZURE_SEARCH_SEMANTIC_CONFIG) || DEFAULT_SEMANTIC_CONFIG,
  };
}

/**
 * Read Microsoft Foundry (Azure OpenAI) chat config. Configured when an
 * endpoint is present; the key is optional so Phase 4 can rely on managed
 * identity. Without an endpoint, `/api/chat` returns 503.
 */
export function loadChatConfig(env: Env = process.env): ChatConfig | null {
  const endpoint = trimmed(env.AZURE_OPENAI_ENDPOINT);
  if (!endpoint) return null;
  return {
    endpoint,
    key: trimmed(env.AZURE_OPENAI_KEY),
    deployment: trimmed(env.AZURE_OPENAI_DEPLOYMENT) || DEFAULT_DEPLOYMENT,
    apiVersion: trimmed(env.AZURE_OPENAI_API_VERSION) || DEFAULT_API_VERSION,
  };
}

export function loadAiConfig(env: Env = process.env): AiConfig {
  return { search: loadSearchConfig(env), chat: loadChatConfig(env) };
}
