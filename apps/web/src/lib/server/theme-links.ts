import { match } from '$app/paths';
import type { RouteId } from '$app/types';
import { BLOCKS, LINK, walkBlocks } from '@cms/sdk';
import type { PublicTheme } from '@cms/sdk';

/** Configured block links use the complete server matcher, never the client's page catch-all. */
export const themeLinks = async (
  theme: Pick<PublicTheme, 'templates' | 'parts'>,
): Promise<Record<string, RouteId>> => {
  const hrefs = new Set<string>();
  for (const block of walkBlocks([
    ...Object.values(theme.templates).flat(),
    ...theme.parts.flatMap((part) => part.blocks),
  ])) {
    for (const [key, attr] of Object.entries(BLOCKS[block.name].attrs)) {
      if (attr.type !== 'text' || attr.pattern !== LINK) continue;
      const href = (block.attrs as Record<string, unknown>)[key];
      if (typeof href === 'string' && href) hrefs.add(href);
    }
  }
  const links = await Promise.all(
    [...hrefs].map(async (href) => {
      const route = await match(href).catch(() => null);
      return route ? ([href, route.id] as const) : null;
    }),
  );
  return Object.fromEntries(links.filter((link) => link !== null));
};
