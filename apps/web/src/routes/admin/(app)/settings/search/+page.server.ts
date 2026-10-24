import type { SearchSettingsInput } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import { secretInput } from '#lib/admin/settings/input.server.js';
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
    const input: SearchSettingsInput = {
      enabled: form.has('enabled'),
      host: text(form, 'host'),
      indexPrefix: text(form, 'indexPrefix') || 'cms',
      apiKey: secretInput(form, 'apiKey', 'removeApiKey'),
    };
    return submitAction(() => adminFor(event).search.update(input));
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
    return submitAction(
      () => adminFor(event).search.reindex(),
      'searchReindexQueued',
    );
  },
};
