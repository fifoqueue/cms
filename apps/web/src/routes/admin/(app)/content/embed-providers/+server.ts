import { json } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'content.create');
  const providers = await contentApi(event.fetch).embedProviders();
  return json(
    providers.map(({ id, label, urlPattern }) => ({ id, label, urlPattern })),
  );
};
