import { CONTENT_STATUSES, CONTENT_TYPES } from '@cms/sdk';
import type { ContentStatus, ContentType } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const pick = <T extends string>(options: readonly T[], value: string | null) =>
  options.find((option) => option === value);

export const load: PageServerLoad = async (event) => {
  const params = event.url.searchParams;
  const type = pick<ContentType>(CONTENT_TYPES, params.get('type'));
  const status = pick<ContentStatus>(CONTENT_STATUSES, params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  return {
    filter: { type, status },
    content: await adminFor(event).content.list({
      type,
      status,
      page,
      pageSize: 20,
    }),
  };
};

export const actions: Actions = {
  delete: async (event) => {
    const id = text(await event.request.formData(), 'id');
    try {
      await adminFor(event).content.remove(id);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'Deleted' };
  },
};
