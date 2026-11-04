import type { Overrides } from '#lib/i18n/overrides.js';

/** How long a cached translation is used without asking the API again. */
export const OVERRIDE_FRESH_MS = 30_000;

/** How long a page waits for the override call (request and response body) before going without. */
export const OVERRIDE_TIMEOUT_MS = 1000;

/** At most this many translations are kept; the oldest is dropped first. */
const MAX_ENTRIES = 32;

/** The locale the API chose for a request and its registered text. */
export interface Translation {
  locale: string;
  messages: Overrides;
}

/** Reads the translation through the given `fetch`, which carries the conditional request. */
export type ReadOverrides = (
  fetch: typeof globalThis.fetch,
) => Promise<Translation>;

interface Entry {
  value: Translation | null;
  etag: string | null;
  checkedAt: number;
  pending: Promise<Translation | null> | null;
}

/** Thrown through the SDK transport when the API confirms the cached version. */
const NOT_MODIFIED = Symbol('not modified');

export interface OverrideCacheOptions {
  freshMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

/**
 * A per-process cache of translations by key. A fresh entry is served without a request; a stale
 * one (or one checked after the current time) is revalidated with `If-None-Match`, and `304`
 * keeps it. A failed or timed-out call serves
 * the last known translation (`null` when none) and is not retried until the entry is fresh
 * again, so overrides can never break or stall a page. Concurrent requests share one call per key.
 */
export const createOverrideCache = ({
  freshMs = OVERRIDE_FRESH_MS,
  timeoutMs = OVERRIDE_TIMEOUT_MS,
  now = Date.now,
}: OverrideCacheOptions = {}) => {
  const entries = new Map<string, Entry>();

  const store = (key: string, entry: Entry) => {
    entries.delete(key);
    entries.set(key, entry);

    if (entries.size > MAX_ENTRIES)
      entries.delete(entries.keys().next().value!);
  };

  const revalidate = async (
    key: string,
    fetcher: typeof globalThis.fetch,
    read: ReadOverrides,
    previous: Entry | undefined,
  ): Promise<Translation | null> => {
    const deadline = AbortSignal.timeout(timeoutMs);
    let etag: string | null = null;
    const conditional: typeof globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);

      if (previous?.etag) headers.set('if-none-match', previous.etag);
      const response = await fetcher(input, {
        ...init,
        headers,
        signal: init?.signal
          ? AbortSignal.any([init.signal, deadline])
          : deadline,
      });

      if (response.status === 304 && previous) throw NOT_MODIFIED;
      etag = response.headers.get('etag');

      return response;
    };
    const fallback = previous?.value ?? null;
    const expired = new Promise<never>((_, reject) =>
      deadline.addEventListener('abort', () => reject(deadline.reason), {
        once: true,
      }),
    );

    try {
      const { locale, messages } = await Promise.race([
        read(conditional),
        expired,
      ]);
      const value = { locale, messages };

      store(key, { value, etag, checkedAt: now(), pending: null });

      return value;
    } catch (error) {
      store(key, {
        value: fallback,
        etag: error === NOT_MODIFIED ? (previous?.etag ?? null) : null,
        checkedAt: now(),
        pending: null,
      });

      return fallback;
    }
  };

  /** The translation for `key`, reading it with `read` only when the cached one is stale. */
  return (
    key: string,
    fetcher: typeof globalThis.fetch,
    read: ReadOverrides,
  ): Promise<Translation | null> => {
    const entry = entries.get(key);

    if (entry?.pending) return entry.pending;
    const age = entry ? now() - entry.checkedAt : -1;

    if (age >= 0 && age < freshMs) return Promise.resolve(entry!.value);
    const pending = revalidate(key, fetcher, read, entry);

    store(key, {
      value: entry?.value ?? null,
      etag: entry?.etag ?? null,
      checkedAt: entry?.checkedAt ?? -Infinity,
      pending,
    });

    return pending;
  };
};
