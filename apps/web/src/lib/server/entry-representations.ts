import type { Handle } from '@sveltejs/kit/hooks';
import { CmsApiError } from '@cms/sdk/client';
import { contentApi } from '#lib/server/api.js';
import { siteLayout } from '#lib/server/site-layout.js';
import { markdownDiscoverable, markdownPath } from '#lib/seo/paths.js';
import { GET as markdown } from '#web/routes/[slug].md/+server.js';

export interface MarkdownEntry {
  slug: string;
  path: string;
  protected?: boolean;
  seo: { noIndex: boolean; canonicalUrl: string };
}

/** Explicit media ranges override wildcards, including an explicit q=0 exclusion. */
export const prefersMarkdown = (accept: string | null) => {
  const ranges = (accept ?? '*/*')
    .toLowerCase()
    .split(',')
    .map((part) => {
      const [type, ...parameters] = part.trim().split(';');
      const weight = parameters.find((parameter) =>
        /^\s*q\s*=/.test(parameter),
      );
      const quality =
        weight === undefined
          ? 1
          : /^\s*q\s*=\s*(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.test(weight)
            ? Number(weight.split('=')[1])
            : 0;

      return { type: type!.trim(), quality };
    });
  const quality = (type: string) => {
    for (const match of [type, 'text/*', '*/*']) {
      const matching = ranges.filter((range) => range.type === match);

      if (matching.length)
        return Math.max(...matching.map((range) => range.quality));
    }

    return 0;
  };

  return quality('text/markdown') > quality('text/html');
};

const varyAccept = (headers: Headers) => {
  const vary = (headers.get('vary') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase());

  if (!vary.includes('*') && !vary.includes('accept'))
    headers.append('vary', 'Accept');
};

/** The Markdown endpoint owns serialization, discoverability, filters and validators. */
export const entryRepresentations: Handle = async ({ event, resolve }) => {
  const route = event.route.id;

  if (
    !['GET', 'HEAD'].includes(event.request.method) ||
    event.isDataRequest ||
    !['/(site)', '/(site)/[slug]', '/(site)/[...path]'].includes(route ?? '')
  )
    return resolve(event);
  const { reading, site, seo } = await siteLayout(event);

  if (
    event.url.pathname === site.loginPath ||
    (route === '/(site)' &&
      (!reading.frontPagePath ||
        event.url.searchParams.has('q') ||
        event.url.searchParams.has('type')))
  )
    return resolve(event);
  let response: Response | undefined;

  if (prefersMarkdown(event.request.headers.get('accept'))) {
    const path =
      event.url.pathname === '/' ? reading.frontPagePath! : event.url.pathname;
    const resolved = await contentApi(event.fetch)
      .resolvePath(path)
      .catch((caught: unknown) => {
        if (caught instanceof CmsApiError && [404, 410].includes(caught.status))
          return null;
        throw caught;
      });
    const content = resolved?.content;
    const canonical =
      content?.path === reading.frontPagePath ? '/' : content?.path;

    if (
      content &&
      canonical === event.url.pathname &&
      content.path !== reading.postsPagePath &&
      markdownDiscoverable(
        { ...content, path: canonical },
        seo.siteUrl,
        seo.indexingEnabled,
      )
    ) {
      response = await markdown({
        ...event,
        params: { slug: content.slug },
        url: new URL(markdownPath(content.slug), event.url),
      } as Parameters<typeof markdown>[0]);
    }
  }

  response ??= await resolve(event);
  const headers = new Headers(response.headers);
  const entry = event.locals.markdownEntry;

  varyAccept(headers);
  if (
    entry &&
    entry.path === event.url.pathname &&
    [200, 304].includes(response.status) &&
    response.headers.get('content-type')?.startsWith('text/html') &&
    markdownDiscoverable(entry, seo.siteUrl, seo.indexingEnabled)
  )
    headers.append(
      'link',
      `<${seo.siteUrl}${markdownPath(entry.slug)}>; rel="alternate"; type="text/markdown"`,
    );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
