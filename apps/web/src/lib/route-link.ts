import { routes } from '$app/manifest';
import { resolve } from '$app/paths';
import type { RouteId, RouteIdWithSearchOrHash } from '$app/types';

const documents = new Set<RouteId>(
  routes.filter((route) => !route.page).map((route) => route.id),
);

/** A matched framework route decides navigation; URL spelling and link labels do not. */
export const linkOptions = (id: RouteId | undefined) => ({
  'data-sveltekit-reload': id && documents.has(id) ? true : undefined,
});

/** Resolve typed route IDs/params and keep their document/page capability with the href. */
export const routeLink = <T extends RouteIdWithSearchOrHash>(
  ...args: Parameters<typeof resolve<T>>
) => ({
  href: resolve<T>(...args),
  ...linkOptions(args[0].split(/[?#]/, 1)[0] as RouteId),
});
