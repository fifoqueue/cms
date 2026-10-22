import { error } from '@sveltejs/kit';
import { Errors } from '#lib/server/errors.js';
import { walkBlocks } from '@cms/sdk';
import type { PublicTheme } from '@cms/sdk';
import type { contentApi } from '#lib/server/api.js';
import { listView } from '#lib/server/public-view.js';
import { queryKey } from '#lib/theme/queries.js';

/** Deduplicate independent queries across templates and reusable parts. */
export const loadThemeQueries = async (
  api: ReturnType<typeof contentApi>,
  theme: PublicTheme,
) => {
  const blocks = [
    ...Object.values(theme.templates).flat(),
    ...theme.parts.flatMap((part) => part.blocks),
  ];
  const queries = new Map(
    [...walkBlocks(blocks)].flatMap((block) =>
      block.name === 'query' && !block.attrs.inherit
        ? [[queryKey(block), block.attrs] as const]
        : [],
    ),
  );
  if (queries.size > 32) error(400, Errors.ThemeQueriesLimit);
  const results: Record<string, ReturnType<typeof listView>> = {};
  // Sequential requests bound database concurrency even for large uploaded themes.
  for (const [key, query] of queries) {
    results[key] = listView(
      await api.list({
        type: query.type || undefined,
        category: query.category || undefined,
        tag: query.tag || undefined,
        author: query.author || undefined,
        pageSize: query.count,
      }),
    );
  }
  return results;
};
