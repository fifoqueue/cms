import { MEDIA_KINDS } from '@cms/sdk';
import type { MediaKind } from '@cms/sdk';

/**
 * The media library's filters as its address holds them (`filter`, kept in every filter and
 * page link), and the matching `media.list` query. The list always comes from the database.
 */
export const readMediaFilter = (params: URLSearchParams) => {
  const kind = MEDIA_KINDS.find((option) => option === params.get('kind')) as
    MediaKind | undefined;
  const search = (params.get('q') ?? '').trim().slice(0, 200) || undefined;
  // `YYYY-MM` from the month input; anything else means "every month".
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.exec(params.get('month') ?? '')?.[0];
  const unattached = params.get('unattached') === '1' || undefined;
  // Files the last resync could not find in the storage.
  const missing = params.get('missing') === '1' || undefined;
  const view = params.get('view') === 'list' ? 'list' : undefined;
  return {
    filter: {
      kind,
      q: search,
      month,
      unattached: unattached && ('1' as const),
      missing: missing && ('1' as const),
      view,
    },
    query: {
      kind,
      search,
      month,
      unattached: unattached && ('true' as const),
      missing: missing && ('true' as const),
    },
  };
};
