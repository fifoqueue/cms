import type { RequestEvent } from '@sveltejs/kit';
import { filterDiscovery } from '#lib/server/seo-filter.js';
import { conditionalResponse, notFound } from '#lib/server/seo-discovery.js';

/** Static core routes win; unclaimed root documents remain 404. */
export const rootDocument = async (
  event: Pick<RequestEvent, 'fetch' | 'request' | 'getClientAddress' | 'url'>,
  name: string,
  format: 'txt' | 'json' | 'xml',
) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(name)) return notFound();
  const inputs = [
    {
      kind: 'discovery.document' as const,
      value: null as { body: string; updatedAt?: string } | null,
      context: { path: `/${name}.${format}` },
    },
  ];
  const [document] = await filterDiscovery(event, inputs);

  if (!document || new TextEncoder().encode(document.body).byteLength > 512000)
    return notFound();
  const types = {
    txt: 'text/plain',
    json: 'application/json',
    xml: 'application/xml',
  };

  return conditionalResponse(
    event.request,
    new Response(document.body, {
      headers: {
        'content-type': `${types[format]}; charset=utf-8`,
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex',
      },
    }),
    document.updatedAt,
  );
};
