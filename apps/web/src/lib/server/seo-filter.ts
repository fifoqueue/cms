// Discovery output filters (`POST /api/v1/seo/filter`): plugins adjust feeds, robots.txt,
// llms.txt, page meta and Markdown before this app escapes and serializes them. Filtering is
// optional: without a frontend proof, or on any failure (refusal, overload, invalid or
// oversized input/output, server or network error), the unfiltered value is used and the
// failure is logged once per reason. A plugin can never break a public page this way.
import type { RequestEvent } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import type { ClientProof, ContentClient } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { frontendSecret } from '#lib/server/frontend-secret.js';
import { clientProof } from '#lib/server/visitor.js';

export type FilterInput = Parameters<
  ContentClient['seo']['filterBatch']
>[0][number];

/** Values by position, with the same kinds as `inputs`. */
type Values<T extends readonly FilterInput[]> = {
  [I in keyof T]: T[I]['value'];
};

const logged = new Set<string>();
const logOnce = (reason: string, error?: unknown) => {
  if (logged.has(reason)) return;
  logged.add(reason);
  console.warn(
    `[seo] discovery filters skipped (${reason}); serving unfiltered output`,
    error instanceof Error ? error.message : '',
  );
};

/** Log reason of a failed filter call: the API status and code, or a network failure. */
const reasonOf = (error: unknown) =>
  error instanceof CmsApiError
    ? `status ${error.status} ${error.code}`
    : 'unreachable';

/** The request a discovery document or page is served for. */
export type FilterEvent = Pick<RequestEvent, 'fetch' | 'getClientAddress'>;

/**
 * Filters every input in one call, proved as the visitor of `event`. Returns the filtered
 * values in order, or the inputs' own values when filtering is unavailable.
 */
export const filterDiscovery = <const T extends readonly FilterInput[]>(
  event: FilterEvent,
  inputs: T,
) =>
  filterWith(
    event.fetch,
    filtersAvailable() ? clientProof(event.getClientAddress()) : undefined,
    inputs,
  );

/** Whether this server can prove visitors to the API, which the filter RPC requires. */
export const filtersAvailable = () => Boolean(frontendSecret());

/** How long a page waits for plugin filters (request and response body) before going without. */
export const SEO_FILTER_TIMEOUT_MS = 1500;

/** `fetch` whose requests all end at `signal` (the SDK transport takes no signal of its own). */
const bounded =
  (fetcher: typeof fetch, signal: AbortSignal): typeof fetch =>
  (input, init) =>
    fetcher(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });

/**
 * `filterDiscovery` with an explicit fetch and proof. The call, including reading the response,
 * is bounded by `timeoutMs`. Never throws for a failed filter call.
 */
export const filterWith = async <const T extends readonly FilterInput[]>(
  fetcher: typeof fetch,
  proof: ClientProof | undefined,
  inputs: T,
  timeoutMs = SEO_FILTER_TIMEOUT_MS,
): Promise<Values<T>> => {
  const unfiltered = inputs.map((input) => input.value) as Values<T>;
  if (!inputs.length) return unfiltered;
  if (!proof) {
    logOnce('no frontend proof');
    return unfiltered;
  }
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    return (await contentApi(bounded(fetcher, deadline)).seo.filterBatch(
      [...inputs],
      proof,
    )) as Values<T>;
  } catch (error) {
    // Invalid filter output surfaces as the SDK's 502 `invalid_response`.
    logOnce(deadline.aborted ? 'timeout' : reasonOf(error), error);
    return unfiltered;
  }
};
