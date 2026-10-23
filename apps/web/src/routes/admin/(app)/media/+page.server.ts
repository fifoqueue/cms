import { MEDIA_KINDS } from '@cms/sdk';
import type { MediaKind } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { clampPage } from '#lib/server/page-range.js';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'media.upload');
  const params = event.url.searchParams;
  const kind = MEDIA_KINDS.find((option) => option === params.get('kind')) as
    MediaKind | undefined;
  const search = (params.get('q') ?? '').trim().slice(0, 200) || undefined;
  // `YYYY-MM` from the month input; anything else means "every month".
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.exec(params.get('month') ?? '')?.[0];
  const unattached = params.get('unattached') === '1' || undefined;
  const view = params.get('view') === 'list' ? 'list' : undefined;
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  const screen = readScreenOptions(event.cookies, 'media', [], 48);
  const media = await adminFor(event).media.list({
    kind,
    search,
    month,
    unattached: unattached && 'true',
    page,
    pageSize: screen.perPage,
  });
  clampPage(event.url, media);
  return {
    filter: {
      kind,
      q: search,
      month,
      unattached: unattached && ('1' as const),
      view,
    },
    screen,
    media,
  };
};

export const actions: Actions = {
  /** Deletes the selected files; files that entries still show are kept and counted. */
  delete: async (event) => {
    const form = await event.request.formData();
    const ids = form
      .getAll('ids')
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 100);
    const admin = adminFor(event);
    let deleted = 0;
    let kept = 0;
    for (const id of ids) {
      try {
        await admin.media.remove(id, false);
        deleted++;
      } catch (caught) {
        // In use (conflict) or not the user's file (forbidden): left as it is.
        if (!(caught instanceof CmsApiError && caught.status < 500))
          throw caught;
        kept++;
      }
    }
    return { deleted, kept };
  },
};
