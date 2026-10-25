// The HTTP transport every client shares: JSON bodies, error mapping and response validation.
import { z } from 'zod';
import { apiErrorBodySchema } from '#sdk/common';
import { Errors } from '#sdk/errors';

export class CmsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = 'CmsApiError';
  }
}

export interface ClientOptions {
  /** Origin of the API, e.g. `http://localhost:4000`. */
  baseUrl: string;
  fetch?: typeof fetch;
}

export type Query = Record<string, string | number | undefined>;

export interface RequestOptions<T = unknown> {
  query?: Query;
  json?: unknown;
  body?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
  response?: z.ZodType<T>;
  /** Resolve with the response body as text (downloads such as exports). */
  text?: boolean;
  /** Return the successful response without buffering its body. */
  raw?: boolean;
}

export const pageSchema = <T>(item: z.ZodType<T>) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });

const toSearch = (query: Query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const search = params.toString();
  return search ? `?${search}` : '';
};

export const createTransport = (
  { baseUrl, fetch: fetcher = fetch }: ClientOptions,
  token?: string,
  defaultHeaders?: Record<string, string>,
) => {
  return async <T>(
    method: string,
    path: string,
    options: RequestOptions<T> = {},
  ): Promise<T> => {
    const headers = new Headers({
      ...defaultHeaders,
      ...options.headers,
      accept: 'application/json',
    });
    if (token) headers.set('authorization', `Bearer ${token}`);
    let body = options.body;
    if (options.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(options.json);
    } else if (options.contentType) {
      headers.set('content-type', options.contentType);
    }

    const response = await fetcher(
      `${baseUrl}${path}${toSearch(options.query)}`,
      {
        method,
        headers,
        body,
        // A streamed body (an upload passed straight through) must declare half-duplex;
        // Node's fetch rejects it otherwise. Not yet in the DOM `RequestInit` type.
        ...(body instanceof ReadableStream && { duplex: 'half' }),
      } as RequestInit,
    );
    if (response.status === 204 && !options.response) return undefined as T;
    if (options.raw && response.ok) return response as T;
    if (options.text && response.ok) return (await response.text()) as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorBodySchema.safeParse(payload);
      const error = parsed.success ? parsed.data.error : undefined;
      throw new CmsApiError(
        response.status,
        error?.code ?? 'http_error',
        error?.message ?? response.statusText,
        error?.issues,
      );
    }
    if (options.response) {
      const parsed = options.response.safeParse(payload);
      if (!parsed.success)
        throw new CmsApiError(502, 'invalid_response', Errors.InvalidResponse);
      return parsed.data;
    }
    // Commands without a response contract never return arbitrary API data to callers.
    return undefined as T;
  };
};

/** A bound request function, as handed to feature clients. */
export type Request = ReturnType<typeof createTransport>;
