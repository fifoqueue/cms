import type { WidgetsSettingsInput } from '@cms/sdk';
import { failFrom, jsonField } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const admin = adminFor(event);
  const [widgets, types, menus] = await Promise.all([
    admin.widgets.get(),
    admin.widgets.types(),
    admin.menus.get(),
  ]);
  return {
    widgets,
    types,
    menus: menus.menus.map(({ id, name }) => ({ id, name })),
  };
};

export const actions: Actions = {
  /** Both areas are sent as one JSON document; the API validates it. */
  save: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).widgets.update(
        jsonField(form, 'widgets') as WidgetsSettingsInput,
      );
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
