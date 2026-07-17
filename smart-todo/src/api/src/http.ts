import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import { ApiError, toErrorBody } from './models/errors.js';

export function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: body,
  };
}

export function noContent(): HttpResponseInit {
  return { status: 204 };
}

export function errorResponse(err: unknown): HttpResponseInit {
  const { status, body } = toErrorBody(err);
  return json(status, body);
}

export async function readJsonBody(request: HttpRequest): Promise<unknown> {
  const text = await request.text();
  if (!text || text.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw ApiError.validation('Request body must be valid JSON.');
  }
}
