import { contentApi } from '#lib/server/api.js';
import { sessionToken } from '#lib/server/session-cookie.js';
import { entryActions, entryPage } from '#lib/server/content-page.js';
import { notFoundFrom } from '#lib/server/errors.js';
import { latestPosts, listPosts } from '#lib/server/archive.js';
import { homeTypeParam, pageParam } from '#lib/server/public-view.js';
import { loadSlots } from '#lib/server/slots.js';
import {
  loadTemplateData,
  withTemplateData,
} from '#lib/server/theme-queries.js';
import { unlockProofs } from '#lib/server/unlock.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Search uses a query string, so existing content at `/search` keeps its URL. The home page
 * shows the static front page (Settings → Reading) or lists posts, or articles with
 * `?type=article`; search covers every searchable type.
 */
export const load: PageServerLoad = async (event) => {
  const { fetch, url, cookies, parent } = event;
  const api = contentApi(fetch, sessionToken(cookies, url));
  // Block data is public: it never uses the visitor's session.
  const publicApi = contentApi(fetch);
  const page = pageParam(url);
  const reading = await api.reading().catch(() => null);
  const pageSize = reading?.postsPerPage ?? 10;
  if (url.searchParams.has('q')) {
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
    const [posts, loaded] = await Promise.all([
      query ? listPosts(api, url, { search: query }, pageSize) : null,
      loadSlots(api, { path: url.pathname }),
    ]);
    return withTemplateData(publicApi, event, {
      kind: 'search' as const,
      query,
      posts,
      slots: loaded,
    });
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
      async (page) => loadTemplateData(publicApi, await parent(), page),
      '/',
    );
  }
  const type = homeTypeParam(url);
  const [posts, loaded] = await Promise.all([
    latestPosts(api, type, page, pageSize),
    loadSlots(api, { path: url.pathname }),
  ]);
  return withTemplateData(publicApi, event, {
    kind: 'home' as const,
    type,
    posts,
    slots: loaded,
  });
};

export const actions: Actions = entryActions;
