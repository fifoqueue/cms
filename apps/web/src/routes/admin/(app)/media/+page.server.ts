import { can } from '@cms/sdk/capabilities';
import { CmsApiError } from '@cms/sdk/client';
import { readMediaFilter } from '#lib/admin/media-filter.js';
import { submitAction } from '#lib/server/form-action.js';
import { clampPage } from '#lib/server/page-range.js';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'media.upload');
  const params = event.url.searchParams;
  const { filter, query } = readMediaFilter(params);
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  const screen = readScreenOptions(event.cookies, 'media', [], 48);
  // Polled while a resync runs. The list comes from the database only, never the storage.
  event.depends('media:resync');
  const admin = adminFor(event);
  const [media, resync] = await Promise.all([
    admin.media.list({ ...query, page, pageSize: screen.perPage }),
    event.locals.user && can(event.locals.user, 'media.manage')
      ? admin.media.storage.resyncStatus()
      : null,
  ]);
  clampPage(event.url, media);
  return {
    filter,
    screen,
    media,
    resync,
  };
};

export const actions: Actions = {
  /** Queues a pass over the current storage (or joins the one already running). */
  resync: async (event) => {
    requireCapability(event.locals, 'media.manage');
    return submitAction(
      () => adminFor(event).media.storage.resync(),
      'mediaResyncStarted',
    );
  },
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
