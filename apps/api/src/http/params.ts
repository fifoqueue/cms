import { t } from 'elysia';

// The URL shape comes from the route file's path (`[id].ts` -> `:id`). These schemas only give
// the handlers typed `params`; path segments are always strings.
const params = <const K extends string>(key: K) => ({
  params: t.Object(
    { [key]: t.String() } as Record<K, ReturnType<typeof t.String>>,
    { additionalProperties: true }, // Wildcard routes also carry `*`.
  ),
});

export const idParams = params('id');

export const slugParams = params('slug');

export const pluginParams = params('pluginId');
