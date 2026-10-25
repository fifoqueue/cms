import { json } from '@sveltejs/kit';
import { MEDIA_KINDS } from '@cms/sdk';
import type { MediaKind } from '@cms/sdk';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** One page of the library for the media picker, or with `id` one file (the editor's size choices). */
export const GET: RequestHandler = async (event) => {
  requireCapability(event.locals, 'media.upload');
  const params = event.url.searchParams;
  const id = params.get('id');
  if (id) return json(await adminFor(event).media.get(id.slice(0, 36)));
  const kind = MEDIA_KINDS.find((option) => option === params.get('kind')) as
    MediaKind | undefined;
  return json(
    await adminFor(event).media.list({
      kind,
      search: params.get('search')?.slice(0, 200) || undefined,
      page: Math.max(1, Math.trunc(Number(params.get('page'))) || 1),
      pageSize: 24,
    }),
  );
};
