import { resolveArchivePath } from '@cms/sdk';
import { error, redirect } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { commentAction } from '#lib/server/comments.js';
import { entryPage } from '#lib/server/content-page.js';
import { Errors, notFoundFrom } from '#lib/server/errors.js';
import { latestPosts, loadTermArchive } from '#lib/server/archive.js';
import { pageParam } from '#lib/server/public-view.js';
import { isInternalPath } from '#lib/server/permalink.js';
import { loadSlots } from '#lib/server/slots.js';
import { unlockAction, unlockProofs } from '#lib/server/unlock.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Content at its permalink. The API resolves the already-encoded request pathname; former
 * paths answer with a permanent redirect to the current permalink on this site only. With a
 * static front page (Settings → Reading), that page redirects to `/` and the posts page lists
 * the latest posts instead of its own body.
 */
export const load: PageServerLoad = async ({ fetch, url, cookies, parent }) => {
  const api = contentApi(fetch);
  const layout = await parent();
  const archive = resolveArchivePath(layout.archives, url.pathname);
  if (archive) {
    if (archive.redirect) redirect(308, `${archive.path}${url.search}`);
    return loadTermArchive(
      fetch,
      url,
      archive.taxonomy,
      archive.slug,
      layout.reading.postsPerPage,
      layout.archives,
    );
  }
  // The API finds the content of a current path itself, so slots load alongside the lookup.
  const slots = loadSlots(api, { path: url.pathname });
  const types = api.contentTypes().catch(() => []);
  const reading = api.reading().catch(() => null);
  const { content, redirect: moved } = await api
    .resolvePath(url.pathname, unlockProofs(cookies))
    .catch(notFoundFrom);
  if (moved) {
    if (!isInternalPath(content.path)) error(502, Errors.InvalidContentPath);
    redirect(308, `${content.path}${url.search}`);
  }
  const settings = await reading;
  if (settings?.frontPagePath === content.path) redirect(308, `/${url.search}`);
  if (settings?.postsPagePath === content.path) {
    return {
      kind: 'home' as const,
      type: 'post' as const,
      path: content.path,
      title: content.title,
      posts: await latestPosts(
        api,
        'post',
        pageParam(url),
        settings.postsPerPage,
      ),
      slots: await slots,
    };
  }
  return entryPage(api, url, content, types, slots);
};

export const actions: Actions = {
  unlock: unlockAction,
  comment: commentAction,
};
