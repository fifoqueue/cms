import { redirect } from '@sveltejs/kit';
import { can } from '@cms/sdk/capabilities';
import { contentApi } from '#lib/server/api.js';
import { adminFor } from '#lib/server/session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const { locals, fetch } = event;
  if (!locals.user) redirect(303, '/admin/login');
  const { id, email, name, role, capabilities, slug, bio, locale } =
    locals.user;
  const admin = adminFor(event);
  const user = locals.user;
  // Menu extras are optional: a failure only drops the entry or the count.
  const [site, pages, model, taxonomies, comments, plugins] = await Promise.all(
    [
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
    ],
  );
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
    siteTitle: site.title,
    /** The user's chosen language, else the site's. */
    language: locale || site.locale,
  };
};
