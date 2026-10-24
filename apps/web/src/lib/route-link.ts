import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { RouteId, RouteIdWithSearchOrHash } from '$app/types';
import { documents as routes } from 'virtual:cms/route-kinds';
import { routeMatcher } from '#lib/route-match.js';

// Generated from `src/routes`, not `$app/manifest`: `svelte-kit sync` empties that in dev.
const documents = new Set<RouteId>(routes);
const isDocument = routeMatcher(routes);

/** A matched framework route decides navigation; URL spelling and link labels do not. */
export const linkOptions = (id: RouteId | undefined) => ({
  'data-sveltekit-reload': id && documents.has(id) ? true : undefined,
});

const parse = (href: string) => {
  try {
    return new URL(href, page.url.href);
  } catch {
    return null;
  }
};

/**
 * Options for an href chosen at runtime (menus, widgets): a same-site URL served only by an
 * endpoint must load as a document, or the catch-all page route captures it in the client.
 */
export const hrefOptions = (href: string | null | undefined) => {
  const url = href ? parse(href) : null;
  // Kit 3 has no `base` export; the home route resolves to `${base}/` (possibly relative).
  const base = parse(resolve('/(site)'))?.pathname.slice(0, -1);
  return {
    'data-sveltekit-reload':
      url?.origin === page.url.origin && isDocument(url.pathname, base)
        ? true
        : undefined,
  };
};

/** Resolve typed route IDs/params and keep their document/page capability with the href. */
export const routeLink = <T extends RouteIdWithSearchOrHash>(
  ...args: Parameters<typeof resolve<T>>
) => ({
  href: resolve<T>(...args),
  ...linkOptions(args[0].split(/[?#]/, 1)[0] as RouteId),
});
