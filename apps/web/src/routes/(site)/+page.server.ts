import { requirePage } from '#lib/server/public-view.js';
import { contentApi } from '#lib/server/api.js';
import { SESSION_COOKIE } from '#lib/server/session.js';
import { commentAction } from '#lib/server/comments.js';
import { entryPage } from '#lib/server/content-page.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { latestPosts } from '#lib/server/archive.js';
import { homeTypeParam, listView, pageParam } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import { unlockAction, unlockProofs } from '#lib/server/unlock.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Search uses a query string, so existing content at `/search` keeps its URL. The home page
 * shows the static front page (Settings → Reading) or lists posts, or articles with
 * `?type=article`; search covers every searchable type.
 */
export const load: PageServerLoad = async (event) => {
  const { fetch, url, cookies } = event;
  const api = contentApi(fetch, cookies.get(SESSION_COOKIE));
  const page = pageParam(url);
  const reading = await api.reading().catch(() => null);
  const pageSize = reading?.postsPerPage ?? 10;
  if (url.searchParams.has('q')) {
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
    const [posts, loaded] = await Promise.all([
      query ? api.list({ search: query, page, pageSize }) : null,
      loadSlots(api, { path: url.pathname }),
    ]);
    return {
      kind: 'search' as const,
      query,
      posts: posts && (requirePage(posts), listView(posts)),
      slots: loaded,
    };
  }
  if (reading?.frontPagePath && !url.searchParams.has('type')) {
    const types = api.contentTypes().catch(() => []);
    const { content } = await api
      .resolvePath(reading.frontPagePath, unlockProofs(cookies))
      .catch(notFoundFrom);
    return entryPage(
      api,
      event,
      content,
      types,
      loadSlots(api, { path: '/', contentId: content.id }),
      '/',
    );
  }
  const type = homeTypeParam(url);
  const [posts, loaded] = await Promise.all([
    latestPosts(api, type, page, pageSize),
    loadSlots(api, { path: url.pathname }),
  ]);
  return { kind: 'home' as const, type, posts, slots: loaded };
};

export const actions: Actions = {
  unlock: unlockAction,
  comment: commentAction,
};
