import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => ({
  site: await contentApi(fetch).site(),
});

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).site.update({
        title: text(form, 'title'),
        description: text(form, 'description'),
        locale: text(form, 'locale'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'Settings saved' };
  },
};
