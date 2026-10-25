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
export const methodParams = params('method');
export const factorParams = params('factor');
export const factorCredentialParams = {
  params: t.Object({ factor: t.String(), credential: t.String() }),
};

export const slugParams = params('slug');

export const pluginParams = params('pluginId');

export const tokenParams = params('token');

export const revisionParams = {
  params: t.Object({ id: t.String(), revisionId: t.String() }),
};

/** Routes ending in `[...].ts`: the rest of the path. */
export const restParams = params('*');

export const keyParams = params('key');

export const themeTemplateParams = {
  params: t.Object({ id: t.String(), name: t.String() }),
};

export const themePartParams = {
  params: t.Object({ id: t.String(), slug: t.String() }),
};
