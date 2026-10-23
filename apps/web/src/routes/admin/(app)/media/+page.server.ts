import { MEDIA_KINDS } from '@cms/sdk';
import type { MediaKind } from '@cms/sdk';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'media.upload');
  const params = event.url.searchParams;
  const kind = MEDIA_KINDS.find((option) => option === params.get('kind')) as
    MediaKind | undefined;
  const search = (params.get('q') ?? '').trim().slice(0, 200) || undefined;
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  const screen = readScreenOptions(event.cookies, 'media', [], 48);
  return {
    filter: { kind, q: search },
    screen,
    media: await adminFor(event).media.list({
      kind,
      search,
      page,
      pageSize: screen.perPage,
    }),
  };
};
