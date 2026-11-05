import { resolveArchivePath } from '@cms/sdk';
import { error, redirect } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { sessionToken } from '#lib/server/session-cookie.js';
import { entryActions, entryPage } from '#lib/server/content-page.js';
import { Errors, notFoundFrom } from '#lib/server/errors.js';
import { latestPosts, loadTermArchive } from '#lib/server/archive.js';
import { entrySeoView, imageView, pageParam } from '#lib/server/public-view.js';
import { isInternalPath, isRedirectTarget } from '#lib/server/permalink.js';
import {
  loginPage,
  loginRecoverAction,
  loginStartAction,
} from '#lib/server/login.js';
import { loadSlots } from '#lib/server/slots.js';
import {
  loadTemplateData,
  withTemplateData,
} from '#lib/server/theme-queries.js';
import { unlockProofs } from '#lib/server/unlock.js';
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
  // Content lookup and layout loading run concurrently.
  const resolving = api.resolvePath(url.pathname, unlockProofs(cookies));

  resolving.catch(() => undefined);
  const layout = parent();
  const layoutData = await layout;
  const { archives, reading, site } = layoutData;

  if (url.pathname === site.loginPath)
    return loginPage(event, site.loginPath, Boolean(layoutData.toolbar));
  const archive = resolveArchivePath(archives, url.pathname);

  if (archive) {
    if (archive.redirect) redirect(308, `${archive.path}${url.search}`);

    return loadTermArchive(
      event,
      archive.taxonomy,
      archive.slug,
      layout,
      loadSlots(api, {
        path: url.pathname,
        kind: 'term',
        type: archive.taxonomy,
        slug: archive.slug,
      }),
    );
  }

  const types = api.contentTypes().catch(() => []);
  const resolved = await resolving.catch(notFoundFrom);

  if ('destination' in resolved) {
    if (!isRedirectTarget(resolved.destination.to, url))
      error(502, Errors.InvalidContentPath);
    redirect(resolved.destination.status, resolved.destination.to, {
      external: true,
    });
  }

  const { content, redirect: moved } = resolved;

  if (!content) error(404, Errors.NotFound);
  const slots = loadSlots(api, {
    path: url.pathname,
    kind: reading.postsPagePath === content.path ? 'home' : 'content',
    contentId: content.id,
    type: content.type,
    slug: content.slug,
  });

  if (moved) {
    if (!isInternalPath(content.path)) error(502, Errors.InvalidContentPath);
    redirect(308, `${content.path}${url.search}`);
  }

  if (reading.frontPagePath === content.path) redirect(308, `/${url.search}`);
  // Block data is public: it never uses the visitor's session.
  const publicApi = contentApi(fetch);

  if (reading.postsPagePath === content.path) {
    return withTemplateData(publicApi, event, {
      kind: 'home' as const,
      type: 'post' as const,
      path: content.path,
      title: content.title,
      protected: content.protected,
      passwordProtected: Boolean(
        content.passwordProtected || content.protected,
      ),
      seo: entrySeoView(
        content.seo,
        content.passwordProtected || content.protected,
        !content.protected,
      ),
      description: content.protected
        ? ''
        : content.metaDescription || content.excerpt,
      featuredImage: content.featuredImage && imageView(content.featuredImage),
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
  ...entryActions,
  signIn: loginStartAction,
  recover: loginRecoverAction,
};
