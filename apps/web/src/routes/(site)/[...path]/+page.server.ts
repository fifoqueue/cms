import { resolveArchivePath } from '@cms/sdk';
import { error, redirect } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { sessionToken } from '#lib/server/session-cookie.js';
import { commentAction } from '#lib/server/comments.js';
import { entryPage } from '#lib/server/content-page.js';
import { Errors, notFoundFrom } from '#lib/server/errors.js';
import { latestPosts, loadTermArchive } from '#lib/server/archive.js';
import { pageParam } from '#lib/server/public-view.js';
import { isInternalPath } from '#lib/server/permalink.js';
import { loadSlots } from '#lib/server/slots.js';
import {
  loadTemplateData,
  withTemplateData,
} from '#lib/server/theme-queries.js';
import { unlockAction, unlockProofs } from '#lib/server/unlock.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Content at its permalink. The API resolves the already-encoded request pathname; former
 * paths answer with a permanent redirect to the current permalink on this site only. With a
 * static front page (Settings → Reading), that page redirects to `/` and the posts page lists
 * the latest posts instead of its own body.
 */
export const load: PageServerLoad = async (event) => {
  const { fetch, url, cookies, parent } = event;
  const api = contentApi(fetch, sessionToken(cookies, url));
  // The lookup and the slots start with the layout instead of waiting for it; archive paths
  // discard the lookup and reuse the slots.
  const resolving = api.resolvePath(url.pathname, unlockProofs(cookies));
  resolving.catch(() => undefined);
  const slots = loadSlots(api, { path: url.pathname });
  const layout = parent();
  const { archives, reading } = await layout;
  const archive = resolveArchivePath(archives, url.pathname);
  if (archive) {
    if (archive.redirect) redirect(308, `${archive.path}${url.search}`);
    return loadTermArchive(
      fetch,
      url,
      archive.taxonomy,
      archive.slug,
      layout,
      slots,
    );
  }
  const types = api.contentTypes().catch(() => []);
  const { content, redirect: moved } = await resolving.catch(notFoundFrom);
  if (moved) {
    if (!isInternalPath(content.path)) error(502, Errors.InvalidContentPath);
    redirect(308, `${content.path}${url.search}`);
  }
  if (reading.frontPagePath === content.path) redirect(308, `/${url.search}`);
  // Block data is public: it never uses the visitor's session.
  const publicApi = contentApi(fetch);
  if (reading.postsPagePath === content.path) {
    return withTemplateData(publicApi, parent, {
      kind: 'home' as const,
      type: 'post' as const,
      path: content.path,
      title: content.title,
      posts: await latestPosts(
        api,
        'post',
        pageParam(url),
        reading.postsPerPage,
      ),
      slots: await slots,
    });
  }
  return entryPage(api, event, content, types, slots, async (page) =>
    loadTemplateData(publicApi, await layout, page),
  );
};

export const actions: Actions = {
  unlock: unlockAction,
  comment: commentAction,
};
