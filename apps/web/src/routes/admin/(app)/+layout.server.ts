import { error } from '@sveltejs/kit';
import { can } from '@cms/sdk/capabilities';
import { contentApi } from '#lib/server/api.js';
import { adminFor } from '#lib/server/session.js';
import { loadMenu } from '#lib/server/admin-ui.js';
import { Errors } from '#lib/server/errors.js';
import { adminTranslation } from '#lib/i18n/overrides.server.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const { locals, fetch } = event;

  if (!locals.user) error(404, Errors.NotFound);
  const { id, email, name, role, capabilities, slug, bio, locale } =
    locals.user;
  const admin = adminFor(event);
  const user = locals.user;
  // Menu extras are optional: a failure only drops the entry or the count.
  const [site, pages, model, taxonomies, comments, plugins, menuItems] =
    await Promise.all([
      contentApi(fetch).site(),
      // A plugin problem never takes the admin area down: its pages are simply not listed.
      admin.plugins.pages().catch(() => []),
      can(user, 'content.create')
        ? admin.contentModel.model().catch(() => null)
        : null,
      can(user, 'taxonomy.manage')
        ? admin.taxonomyTypes.list().catch(() => [])
        : [],
      can(user, 'comments.moderate')
        ? admin.comments
            .counts()
            .then((counts) => counts.pending)
            .catch(() => 0)
        : 0,
      can(user, 'plugins.manage')
        ? admin.plugins
            .list()
            .then(
              (list) =>
                list.filter((plugin) => plugin.status === 'failed').length,
            )
            .catch(() => 0)
        : 0,
      // Registered entries the API already checked for this user.
      loadMenu(event),
    ]);
  const translation = await adminTranslation(event, id, locale || site.locale);

  return {
    user: { id, email, name, role, capabilities, slug, bio, locale },
    pluginPages: pages.map(({ plugin, key, title }) => ({
      plugin,
      key,
      title,
    })),
    types:
      model?.types.map(({ key, pluralName, builtin }) => ({
        key,
        pluralName,
        builtin,
      })) ?? [],
    taxonomies: taxonomies
      .filter(({ key }) => key !== 'category' && key !== 'tag')
      .map(({ key, name }) => ({ key, name })),
    counts: { comments, plugins },
    menuItems,
    siteTitle: site.title,
    loginPath: site.loginPath,
    /** The user's chosen language, else the site's, unless the API chose another. */
    language: translation.locale,
    /** Registered text for `language`; the layout merges it into the catalog. */
    overrides: translation.messages,
  };
};
