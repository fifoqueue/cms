import { redirect } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { adminFor } from '#lib/server/session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const { locals, fetch } = event;
  if (!locals.user) redirect(303, '/admin/login');
  const { id, email, name, role, capabilities, slug, bio, locale } =
    locals.user;
  const [site, pages] = await Promise.all([
    contentApi(fetch).site(),
    // A plugin problem never takes the admin area down: its pages are simply not listed.
    adminFor(event)
      .plugins.pages()
      .catch(() => []),
  ]);
  return {
    user: { id, email, name, role, capabilities, slug, bio, locale },
    pluginPages: pages.map(({ plugin, key, title }) => ({
      plugin,
      key,
      title,
    })),
    /** The user's chosen language, else the site's. */
    language: locale || site.locale,
  };
};
