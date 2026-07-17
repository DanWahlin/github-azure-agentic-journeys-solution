import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { ApiError } from '../models/errors.js';
import { validateGeneratedStep } from '../validation.js';
import type { CreateActionStepInput } from '../models/actionStep.js';

export const SYSTEM_PROMPT = `You are a productivity assistant that breaks down goals into actionable steps.

Given a todo item, generate 3-7 concrete, actionable steps to accomplish it.
Each step should be specific enough that someone could start working on it immediately.

Rules:
- Each step title must be under 200 characters
- Each step description must be 1-3 sentences with specific, actionable detail
- Include quantities, time estimates, or specific tools where relevant
- Steps must be in logical order (what to do first, second, etc.)
- Be practical and realistic, not generic or motivational

Respond with ONLY a valid JSON array. No markdown, no code fences, no explanation:
[
  {
    "title": "Short action title",
    "description": "Specific actionable description with details."
  }
]`;

const RETRY_PROMPT = 'Your previous response was not valid JSON. Return ONLY a JSON array.';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Minimal chat abstraction so the generator can be unit-tested without network. */
export type ChatCompleter = (messages: ChatMessage[]) => Promise<string>;

export interface GeneratedStep {
  title: string;
  description: string;
}

/** Ensures the AI endpoint ends with `/openai/v1/` (Bicep may output it without). */
export function normalizeEndpoint(endpoint: string): string {
  let base = endpoint.trim().replace(/\/+$/, '');
  base = base.replace(/\/openai(\/v1)?$/i, '');
  return `${base}/openai/v1/`;
}

/** Strips markdown code fences (```json ... ```) if the model wrapped its output. */
export function stripFences(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  return text;
}

/** Parses and validates the model output into a non-empty array of steps. */
export function parseSteps(raw: string): GeneratedStep[] {
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ApiError.aiService('AI response was not valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw ApiError.aiService('AI response was not a non-empty JSON array.');
  }
  return parsed.map((item, index) => validateGeneratedStep(item, index));
}

/**
 * Calls the model to decompose a todo title into steps. Retries once with a
 * stricter instruction if the first response fails to parse, then throws
 * AI_SERVICE_ERROR.
 */
export async function generateSteps(title: string, complete: ChatCompleter): Promise<GeneratedStep[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: title },
  ];

  let firstRaw = '';
  try {
    firstRaw = await complete(messages);
    return parseSteps(firstRaw);
  } catch (err) {
    // Only retry parse/format failures; propagate other errors unchanged.
    if (err instanceof ApiError && err.code !== 'AI_SERVICE_ERROR') throw err;
  }

  try {
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: firstRaw },
      { role: 'user', content: RETRY_PROMPT },
    ];
    const retryRaw = await complete(retryMessages);
    return parseSteps(retryRaw);
  } catch {
    throw ApiError.aiService('AI service returned unparseable output after retry.');
  }
}

/** Converts validated steps into repository create inputs with 1-based order. */
export function toStepInputs(todoId: string, steps: GeneratedStep[]): CreateActionStepInput[] {
  return steps.map((step, index) => ({
    id: randomUUID(),
    todoId,
    title: step.title,
    description: step.description,
    order: index + 1,
  }));
}

/**
 * Builds a ChatCompleter backed by the OpenAI-compatible SDK against Microsoft
 * Foundry / Azure OpenAI. Uses API-key auth and the normalized `/openai/v1/`
 * base URL. gpt-5 family models reject custom temperature and use
 * max_completion_tokens; the gpt-4.1 fallback uses temperature 0.7.
 */
export function createFoundryCompleter(env: NodeJS.ProcessEnv = process.env): ChatCompleter {
  const endpoint = env.AZURE_AI_ENDPOINT;
  const apiKey = env.AZURE_AI_KEY;
  const model = env.AZURE_AI_DEPLOYMENT ?? 'gpt-5-mini';

  if (!endpoint || !apiKey) {
    throw ApiError.aiService('AI service is not configured (missing AZURE_AI_ENDPOINT or AZURE_AI_KEY).');
  }

  const client = new OpenAI({ baseURL: normalizeEndpoint(endpoint), apiKey });
  const isGpt5 = /^gpt-5/i.test(model);

  return async (messages: ChatMessage[]): Promise<string> => {
    try {
      const request: Record<string, unknown> = {
        model,
        messages,
        max_completion_tokens: 1500,
      };
      if (!isGpt5) {
        request.temperature = 0.7;
        request.max_tokens = 1500;
        delete request.max_completion_tokens;
      }
      const response = await client.chat.completions.create(
        request as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      );
      const content = response.choices[0]?.message?.content;
      if (!content) throw ApiError.aiService('AI service returned an empty response.');
      return content;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.aiService(
        `AI service request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  };
}
