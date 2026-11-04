import type { RequestEvent } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { adminFor } from '#lib/server/session.js';
import { ADMIN_KEYS } from '#lib/i18n/admin-params.js';
import { languageOf } from '#lib/i18n/locale.js';
import { createOverrideCache } from '#lib/i18n/override-cache.server.js';
import type {
  ReadOverrides,
  Translation,
} from '#lib/i18n/override-cache.server.js';
import { pickOverrides } from '#lib/i18n/overrides.js';

const cached = createOverrideCache();

/**
 * The page's translation for the language tag `tag`. The API is asked for the catalog language of
 * `tag`; the page keeps `tag` when the API answers in that language and uses the API's locale
 * otherwise. Without an answer the page keeps `tag` and core messages.
 */
const translate = async (
  key: (language: string) => string,
  fetcher: typeof fetch,
  tag: string,
  read: (language: string) => ReadOverrides,
): Promise<Translation> => {
  const language = languageOf(tag);
  const found = await cached(key(language), fetcher, read(language));

  return {
    locale: found && languageOf(found.locale) !== language ? found.locale : tag,
    messages: found?.messages ?? {},
  };
};

/** Registered public text for the site locale `tag`. */
export const siteTranslation = (fetcher: typeof fetch, tag: string) =>
  translate(
    (language) => `site:${language}`,
    fetcher,
    tag,
    (language) => (bounded) => contentApi(bounded).i18n.messages(language),
  );

/**
 * Registered administration text for the signed-in user `userId` and their language tag `tag`,
 * read with their session, cached per user and limited to catalog keys.
 */
export const adminTranslation = async (
  event: Pick<
    RequestEvent,
    'fetch' | 'locals' | 'request' | 'getClientAddress'
  >,
  userId: string,
  tag: string,
): Promise<Translation> => {
  const { locale, messages } = await translate(
    (language) => `admin:${userId}:${language}`,
    event.fetch,
    tag,
    (language) => (bounded) =>
      adminFor({
        fetch: bounded,
        locals: event.locals,
        request: event.request,
        getClientAddress: event.getClientAddress,
      }).i18n.messages(language),
  );

  return { locale, messages: pickOverrides(messages, ADMIN_KEYS) };
};
