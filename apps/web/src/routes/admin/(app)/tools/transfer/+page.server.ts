import { fail } from '@sveltejs/kit';
import { IMPORT_AUTHOR_MODES } from '@cms/sdk';
import type { ImportAuthorMode } from '@cms/sdk';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions } from './$types';

export const actions: Actions = {
  import: async (event) => {
    const form = await event.request.formData();
    const file = form.get('file');
    const authors = text(form, 'authors');
    if (!(file instanceof File) || file.size === 0)
      return fail(400, { message: Errors.ImportFileRequired });
    try {
      const result = await adminFor(event).importWxr(await file.text(), {
        downloadAttachments: form.get('downloadAttachments') === 'on',
        authors: (IMPORT_AUTHOR_MODES as readonly string[]).includes(authors)
          ? (authors as ImportAuthorMode)
          : 'me',
      });
      return {
        notice: 'importDone',
        result: {
          content: result.content,
          categories: result.categories,
          tags: result.tags,
          comments: result.comments,
          users: result.users,
          menus: result.menus,
          redirects: result.redirects,
          attachments: result.attachments.map(({ url, title, featured }) => ({
            url,
            title,
            featured,
          })),
          skipped: result.skipped.map(({ title, reason, params }) => ({
            title,
            reason,
            ...(params && { params: { ...params } }),
          })),
        },
      };
    } catch (caught) {
      return failFrom(caught);
    }
  },
};
