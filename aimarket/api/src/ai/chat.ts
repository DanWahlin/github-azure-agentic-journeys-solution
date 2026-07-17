/**
 * Shopping-assistant chat adapter (Microsoft Foundry / Azure OpenAI).
 *
 * The route depends only on `ChatCompletionClient`, so it is testable with an
 * in-memory fake. `AzureFoundryChatClient` depends on the minimal
 * `OpenAiClientLike` surface, which the official `openai` `AzureOpenAI` client
 * satisfies structurally. The SDK (and `@azure/identity` for managed identity)
 * are imported lazily by `buildChatClient` only when configured.
 */
import type { ChatConfig } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  maxTokens: number;
  /** Only set for gpt-4.1-family fallbacks; gpt-5 models reject custom temperature. */
  temperature?: number;
}

export interface ChatCompletionClient {
  complete(messages: ChatMessage[], options: ChatCompletionOptions): Promise<string>;
}

/** Narrow structural view of the `openai` client we actually use. */
export interface OpenAiClientLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<{
        choices: Array<{ message?: { content?: string | null } | null } | null>;
      }>;
    };
  };
}

/** gpt-5 family models reject custom temperature and use max_completion_tokens. */
export function isGpt5Family(deployment: string): boolean {
  return /gpt-5/i.test(deployment);
}

export class AzureFoundryChatClient implements ChatCompletionClient {
  constructor(
    private readonly client: OpenAiClientLike,
    private readonly deployment: string,
  ) {}

  async complete(messages: ChatMessage[], options: ChatCompletionOptions): Promise<string> {
    const gpt5 = isGpt5Family(this.deployment);
    const params: Record<string, unknown> = {
      model: this.deployment,
      messages,
    };
    // gpt-5 reasoning models use max_completion_tokens and reject temperature.
    if (gpt5) {
      params.max_completion_tokens = options.maxTokens;
    } else {
      params.max_tokens = options.maxTokens;
      if (typeof options.temperature === 'number') {
        params.temperature = options.temperature;
      }
    }

    const response = await this.client.chat.completions.create(params);
    const content = response.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }
}

/**
 * Construct the real Foundry chat client. Uses the API key when present,
 * otherwise falls back to managed identity (DefaultAzureCredential) — the
 * Phase 4 production path (Cognitive Services User role on the API identity).
 * The `openai`/`@azure/identity` SDKs are imported dynamically. Returns `null`
 * when config is absent.
 */
export async function buildChatClient(
  config: ChatConfig | null,
): Promise<ChatCompletionClient | null> {
  if (!config) return null;
  const { AzureOpenAI } = await import('openai');

  let client: OpenAiClientLike;
  if (config.key) {
    client = new AzureOpenAI({
      endpoint: config.endpoint,
      apiKey: config.key,
      apiVersion: config.apiVersion,
      deployment: config.deployment,
    }) as unknown as OpenAiClientLike;
  } else {
    const { DefaultAzureCredential, getBearerTokenProvider } = await import('@azure/identity');
    const credential = new DefaultAzureCredential();
    const azureADTokenProvider = getBearerTokenProvider(
      credential,
      'https://cognitiveservices.azure.com/.default',
    );
    client = new AzureOpenAI({
      endpoint: config.endpoint,
      azureADTokenProvider,
      apiVersion: config.apiVersion,
      deployment: config.deployment,
    }) as unknown as OpenAiClientLike;
  }

  return new AzureFoundryChatClient(client, config.deployment);
}

const SYSTEM_PROMPT_TEMPLATE = `You are the AIMarket shopping assistant. You help customers find and compare
products from the AIMarket catalog.

Rules:
- Only recommend products that exist in the catalog provided below.
- Include the product name, price, and rating when recommending products.
- If a customer asks about a product category you don't have, say so honestly.
- Keep responses concise (2-3 sentences for simple questions, up to a paragraph for comparisons).
- Do not make up products, prices, or features that aren't in the catalog.
- You cannot process orders, handle returns, or take payments. If asked, explain
  that the customer can add items to their cart on the website.

Current catalog:
{products_json}`;

/** Build the system prompt with the live catalog injected as JSON. */
export function buildSystemPrompt(catalogJson: string): string {
  return SYSTEM_PROMPT_TEMPLATE.replace('{products_json}', catalogJson);
}
