import { redirect } from '@sveltejs/kit';
import { submitAction } from '#lib/server/form-action.js';
import { failFrom, text } from '#lib/server/errors.js';
import { startThemePreview } from '#lib/server/theme-preview.js';
import { adminFor } from '#lib/server/session.js';
import { adminThemeView, readThemeUpload } from '#lib/server/theme-admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  themes: (await adminFor(event).themes.list()).map(adminThemeView),
});

export const actions: Actions = {
  install: async (event) => {
    const upload = await readThemeUpload(
      (await event.request.formData()).get('theme'),
    );
    if ('failure' in upload) return upload.failure;
    return submitAction(
      () => adminFor(event).themes.install(upload.archive),
      'themeInstalled',
    );
  },
  /** Shows the theme on the public site in this browser only, for half an hour. */
  preview: async (event) => {
    const id = text(await event.request.formData(), 'id');
    let token: string;
    try {
      token = (await adminFor(event).themes.preview(id)).token;
    } catch (caught) {
      return failFrom(caught);
    }
    startThemePreview(event.cookies, token);
    redirect(303, '/');
  },
  activate: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return submitAction(
      () => adminFor(event).themes.activate(id),
      'themeActivated',
    );
  },
  remove: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return submitAction(
      () => adminFor(event).themes.remove(id),
      'themeRemoved',
    );
  },
};
