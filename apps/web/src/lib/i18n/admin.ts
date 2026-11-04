import type { AdminLocale, ContentStatus, FieldType, Role } from '@cms/sdk';
import { en } from '#lib/i18n/en.js';
import { ko } from '#lib/i18n/ko.js';
import type { Messages } from '#lib/i18n/messages.js';
import { provideCatalog } from '#lib/i18n/context.js';
import { languageOf } from '#lib/i18n/locale.js';
import { applyOverrides } from '#lib/i18n/overrides.js';
import type { Overrides } from '#lib/i18n/overrides.js';
import { ADMIN_PARAMS } from '#lib/i18n/admin-params.js';

const catalogs: Record<AdminLocale, Messages> = { en, ko };

export const messagesFor = (language: string): Messages =>
  catalogs[languageOf(language)];

const NO_OVERRIDES: Overrides = {};

/**
 * Called by an admin layout; the catalog follows navigation and locale changes. Registered text
 * from `overrides` replaces core messages of the same key; the merged catalog is rebuilt only
 * when the language or the override map changes.
 */
export const provideI18n = (
  language: () => string,
  overrides: () => Overrides = () => NO_OVERRIDES,
) => {
  let built: { tag: string; map: Overrides; messages: Messages } | null = null;

  return provideCatalog({
    get m() {
      const tag = language();
      const map = overrides();

      if (built?.tag !== tag || built.map !== map)
        built = {
          tag,
          map,
          messages: Object.keys(map).length
            ? applyOverrides(messagesFor(tag), map, ADMIN_PARAMS, tag)
            : messagesFor(tag),
        };

      return built.messages;
    },
    get language() {
      return languageOf(language());
    },
  });
};

export const roleLabel = (m: Messages, role: Role) => {
  const labels: Record<string, string> = {
    administrator: m.roleAdministrator,
    editor: m.roleEditor,
    author: m.roleAuthor,
    contributor: m.roleContributor,
    subscriber: m.roleSubscriber,
  };

  return Object.hasOwn(labels, role) ? labels[role]! : role;
};

export const statusLabel = (m: Messages, status: ContentStatus) =>
  ({
    draft: m.statusDraft,
    pending: m.statusPending,
    scheduled: m.statusScheduled,
    published: m.statusPublished,
    private: m.statusPrivate,
  })[status];

/** Built-in type names; other types show their own label. */
export const typeLabel = (m: Messages, type: string) =>
  ({ post: m.typePost, article: m.typeArticle, page: m.typePage })[type] ??
  type;

/** A content type's plural name; built-in types use the catalog. */
export const pluralLabel = (
  m: Messages,
  type: { key: string; pluralName: string },
) =>
  ({ post: m.navPosts, article: m.navArticles, page: m.navPages })[type.key] ??
  type.pluralName;

export const fieldKindLabel = (m: Messages, kind: FieldType) =>
  ({
    text: m.fieldKindText,
    textarea: m.fieldKindTextarea,
    number: m.fieldKindNumber,
    boolean: m.fieldKindBoolean,
    date: m.fieldKindDate,
    url: m.fieldKindUrl,
    select: m.fieldKindSelect,
    image: m.fieldKindImage,
  })[kind];
