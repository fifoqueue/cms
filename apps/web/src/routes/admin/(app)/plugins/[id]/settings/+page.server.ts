import { error, fail } from '@sveltejs/kit';
import { Errors, failFrom } from '#lib/server/errors.js';
import { readPluginSettings } from '#lib/server/plugin-settings-form.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** The installed plugin with this id, or a 404. */
const pluginOf = async (event: {
  fetch: typeof globalThis.fetch;
  locals: App.Locals;
  params: { id: string };
}) => {
  const plugin = (await adminFor(event).plugins.list()).find(
    (candidate) => candidate.id === event.params.id,
  );
  if (!plugin) error(404, Errors.PluginNotFound);
  return plugin;
};

/** A plugin's settings on their own screen (wp-admin's "Settings" row action). */
export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'plugins.manage');
  const { id, name, version, status, settings, values } = await pluginOf(event);
  return { plugin: { id, name, version, status, settings, values } };
};

export const actions: Actions = {
  settings: async (event) => {
    requireCapability(event.locals, 'plugins.manage');
    const [form, plugin] = await Promise.all([
      event.request.formData(),
      pluginOf(event),
    ]);
    if (!plugin.settings.length)
      return fail(404, { message: Errors.PluginNotFound });
    try {
      await adminFor(event).plugins.updateSettings(
        plugin.id,
        readPluginSettings(plugin.settings, form),
      );
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
