import { fail } from '@sveltejs/kit';
import { Errors, failFrom, text } from '#lib/server/errors.js';
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
      return fail(400, { message: Errors.PluginBundleRequired });
    const source = await bundle.text();
    return attempt(
      () => adminFor(event).plugins.install(source),
      'pluginInstalled',
    );
  },
  enable: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return attempt(() => adminFor(event).plugins.enable(id), 'pluginEnabled');
  },
  disable: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return attempt(() => adminFor(event).plugins.disable(id), 'pluginDisabled');
  },
  remove: async (event) => {
    const id = text(await event.request.formData(), 'id');
    return attempt(() => adminFor(event).plugins.remove(id), 'pluginRemoved');
  },
  /** Reports the latest version from the plugin's update address; installs nothing. */
  update: async (event) => {
    const id = text(await event.request.formData(), 'id');
    try {
      const update = await adminFor(event).plugins.checkUpdate(id);
      return {
        update: {
          id,
          latest: update.latest,
          newer: update.newer,
          download: update.download,
        },
      };
    } catch (caught) {
      return failFrom(caught);
    }
  },
  settings: async (event) => {
    const form = await event.request.formData();
    const id = text(form, 'id');
    const admin = adminFor(event);
    const plugin = (await admin.plugins.list()).find(
      (candidate) => candidate.id === id,
    );
    if (!plugin) return fail(404, { message: Errors.PluginNotFound });
    return attempt(
      () =>
        admin.plugins.updateSettings(
          id,
          readPluginSettings(plugin.settings, form),
        ),
      'saved',
    );
  },
};
