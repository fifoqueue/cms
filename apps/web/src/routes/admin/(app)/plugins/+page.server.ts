import { fail } from '@sveltejs/kit';
import { eachBounded, formIds } from '#lib/server/bulk.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const STATUSES = ['active', 'inactive', 'failed'] as const;

export const load: PageServerLoad = async (event) => {
  const plugins = await adminFor(event).plugins.list();
  const params = event.url.searchParams;
  const status = STATUSES.find((option) => option === params.get('status'));
  const search = (params.get('q') ?? '').trim().slice(0, 200).toLowerCase();
  return {
    plugins: plugins.filter(
      (plugin) =>
        (!status || plugin.status === status) &&
        (!search ||
          [plugin.name, plugin.id, plugin.description].some((value) =>
            value.toLowerCase().includes(search),
          )),
    ),
    counts: {
      all: plugins.length,
      ...Object.fromEntries(
        STATUSES.map((option) => [
          option,
          plugins.filter((plugin) => plugin.status === option).length,
        ]),
      ),
    } as Record<(typeof STATUSES)[number] | 'all', number>,
    filter: { status, q: search || undefined },
  };
};

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
  /** Activates, deactivates or deletes every selected plugin, one at a time like the host does. */
  bulk: async (event) => {
    const form = await event.request.formData();
    const action = text(form, 'action');
    const plugins = adminFor(event).plugins;
    const run =
      action === 'enable'
        ? plugins.enable
        : action === 'disable'
          ? plugins.disable
          : action === 'remove'
            ? plugins.remove
            : null;
    if (!run) return {};
    return {
      bulk: await eachBounded(formIds(form), async (id) => {
        await run(id);
      }),
    };
  },
};
