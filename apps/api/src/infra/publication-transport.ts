import type { PublicationTransport } from '#api/domain/seo/publication-push';
import { Errors } from '#api/shared/errors';

/** Injected egress fetch applies administrator network rules, DNS pinning and HTTP hooks. */
export const publicationTransport = (
  fetcher: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): PublicationTransport => {
  const send = async (
    url: string,
    body: string | URLSearchParams,
    contentType: string,
  ) => {
    const response = await fetcher(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { 'content-type': contentType },
      body,
    });

    await response.body?.cancel();
    if (!response.ok)
      throw new Error(Errors.DiscoveryPushFailed(response.status));
  };

  return {
    indexNow: (origin, key, urls) =>
      send(
        'https://api.indexnow.org/indexnow',
        JSON.stringify({
          host: new URL(origin).host,
          key,
          keyLocation: `${origin}/indexnow-key.txt`,
          urlList: urls,
        }),
        'application/json',
      ),
    webSub: (hub, feed) =>
      send(
        hub,
        new URLSearchParams({
          'hub.mode': 'publish',
          'hub.url': feed,
        }),
        'application/x-www-form-urlencoded',
      ),
  };
};
