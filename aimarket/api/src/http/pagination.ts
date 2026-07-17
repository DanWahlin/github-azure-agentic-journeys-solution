/** Parse an integer query param, returning `fallback` when absent/invalid. */
export function parseIntParam(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return n;
}

/** Parse a float query param, returning undefined when absent/invalid. */
export function parseFloatParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Normalize page/pageSize with defaults and a hard cap on pageSize (max 100). */
export function parsePagination(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  let page = parseIntParam(query.page, 1);
  if (page < 1) page = 1;
  let pageSize = parseIntParam(query.pageSize, 20);
  if (pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;
  return { page, pageSize };
}

export function totalPages(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
