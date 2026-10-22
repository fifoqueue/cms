import type { SearchSettingsInput } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [settings, status] = await Promise.all([
    admin.search.settings(),
    admin.search.status(),
  ]);
  return { settings, status };
};

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const apiKey = text(form, 'apiKey');
    const input: SearchSettingsInput = {
      enabled: form.has('enabled'),
      host: text(form, 'host'),
      indexPrefix: text(form, 'indexPrefix') || 'cms',
      apiKey: form.has('removeApiKey') ? '' : apiKey || undefined,
    };
    try {
      await adminFor(event).search.update(input);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  test: async (event) => {
    try {
      const { version } = await adminFor(event).search.test();
      return { notice: `Meilisearch ${version}` };
    } catch (caught) {
      return failFrom(caught);
    }
  },
  reindex: async (event) => {
    try {
      await adminFor(event).search.reindex();
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'searchReindexQueued' };
  },
};
