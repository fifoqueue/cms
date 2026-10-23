import { error } from '@sveltejs/kit';
import { can } from '@cms/sdk';
import type { Capability } from '@cms/sdk';
import { adminApi } from '#lib/server/api.js';
import { Errors } from '#lib/server/errors.js';

/** Admin API client for the signed-in user. `hooks.server.ts` guarantees the session on admin routes. */
export const adminFor = ({
  fetch,
  locals,
}: {
  fetch: typeof globalThis.fetch;
  locals: App.Locals;
}) => {
  if (!locals.token) error(404, Errors.NotFound);
  return adminApi(fetch, locals.token);
};

/** 403 unless the signed-in user's role grants `capability`. The API enforces it again. */
export const requireCapability = (
  locals: App.Locals,
  capability: Capability,
) => {
  if (!locals.user || !can(locals.user, capability))
    error(403, Errors.Forbidden);
};
