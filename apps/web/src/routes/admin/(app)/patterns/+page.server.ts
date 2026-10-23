import { patternListQuerySchema } from '@cms/sdk';
import { clampPage } from '#lib/server/page-range.js';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'content.create');
  const parsed = patternListQuerySchema.safeParse(
    Object.fromEntries(event.url.searchParams),
  );
  const query = parsed.success ? parsed.data : patternListQuerySchema.parse({});
  const list = await adminFor(event).patterns.list(query);
  clampPage(event.url, list);
  return {
    patterns: list.items.map(
      ({ id, title, synced, status, authorId, updatedAt }) => ({
        id,
        title,
        synced,
        status,
        authorId,
        updatedAt,
      }),
    ),
    page: list.page,
    pages: Math.max(1, Math.ceil(list.total / list.pageSize)),
    search: query.search ?? '',
  };
};

export const actions: Actions = {
  delete: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).patterns.remove(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },
};
