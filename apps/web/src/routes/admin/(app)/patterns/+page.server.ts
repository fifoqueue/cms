import { failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'content.create');
  const patterns = await adminFor(event).patterns.list();
  return {
    patterns: patterns.map(
      ({ id, title, synced, status, authorId, updatedAt }) => ({
        id,
        title,
        synced,
        status,
        authorId,
        updatedAt,
      }),
    ),
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
