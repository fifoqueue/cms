import { embedSettingsSchema } from '@cms/sdk';
import { adminFor } from '#lib/server/session.js';
import { jsonField } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const settings = await adminFor(event).embeds.get();
  return {
    settings: embedSettingsSchema.parse({
      providers: settings.providers.map(
        ({ id, label, enabled, urlPattern, src, title, allow, sizing }) => ({
          id,
          label,
          enabled,
          urlPattern,
          src,
          title,
          allow,
          sizing:
            sizing.kind === 'ratio'
              ? { kind: sizing.kind, ratio: sizing.ratio }
              : {
                  kind: sizing.kind,
                  height: sizing.height,
                  heightMessagePath: sizing.heightMessagePath,
                  maxWidth: sizing.maxWidth,
                },
        }),
      ),
    }),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    return submitAction(() =>
      adminFor(event).embeds.update(jsonField(form, 'settings')),
    );
  },
};
