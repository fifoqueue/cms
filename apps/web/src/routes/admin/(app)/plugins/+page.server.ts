import { fail } from '@sveltejs/kit';
import { failFrom, text } from '#lib/server/errors.js';
import { readPluginSettings } from '#lib/server/plugin-settings-form.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  plugins: await adminFor(event).plugins.list(),
});

/** Runs a plugin command and reports the outcome as form data. */
const attempt = async (task: () => Promise<unknown>, notice: string) => {
  try {
    await task();
  } catch (caught) {
    return failFrom(caught);
  }
  return { notice };
};

export const actions: Actions = {
  install: async (event) => {
    const bundle = (await event.request.formData()).get('bundle');
    if (!(bundle instanceof File) || bundle.size === 0)
      return fail(400, { message: 'Choose a plugin bundle (.js)' });
    const source = await bundle.text();
    return attempt(
      () => adminFor(event).plugins.install(source),
      `Installed ${bundle.name}`,
    );
  },
  enable: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return attempt(() => adminFor(event).plugins.enable(id), `Enabled ${id}`);
  },
  disable: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return attempt(() => adminFor(event).plugins.disable(id), `Disabled ${id}`);
  },
  remove: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return attempt(() => adminFor(event).plugins.remove(id), `Removed ${id}`);
  },
  settings: async (event) => {
    const form = await event.request.formData();
    const id = text(form, 'id');
    const admin = adminFor(event);
    const plugin = (await admin.plugins.list()).find(
      (candidate) => candidate.id === id,
    );
    if (!plugin) return fail(404, { message: 'Plugin not found' });
    return attempt(
      () =>
        admin.plugins.updateSettings(
          id,
          readPluginSettings(plugin.settings, form),
        ),
      'Settings saved',
    );
  },
};
