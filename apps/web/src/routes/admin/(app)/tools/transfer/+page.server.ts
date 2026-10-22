import { fail } from '@sveltejs/kit';
import { Errors, failFrom } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions } from './$types';

export const actions: Actions = {
  import: async (event) => {
    const file = (await event.request.formData()).get('file');
    if (!(file instanceof File) || file.size === 0)
      return fail(400, { message: Errors.ImportFileRequired });
    try {
      const result = await adminFor(event).importWxr(await file.text());
      return {
        notice: 'importDone',
        result: {
          content: result.content,
          categories: result.categories,
          tags: result.tags,
          comments: result.comments,
          skipped: result.skipped.map(({ title, reason }) => ({
            title,
            reason,
          })),
        },
      };
    } catch (caught) {
      return failFrom(caught);
    }
  },
};
