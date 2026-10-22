import { getContext, setContext } from 'svelte';
import { ROLES } from '@cms/sdk/capabilities';
import { ADMIN_LOCALES } from '@cms/sdk/locales';
import type { AdminLocale, ContentStatus, FieldType, Role } from '@cms/sdk';
import { en } from '#lib/i18n/en.js';
import { ko } from '#lib/i18n/ko.js';
import type { Messages } from '#lib/i18n/messages.js';

export type { Messages };

const catalogs: Record<AdminLocale, Messages> = { en, ko };

/** The catalog language for a BCP 47 tag (`ko-KR` → `ko`); English when unsupported. */
export const languageOf = (tag: string): AdminLocale => {
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return (ADMIN_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as AdminLocale)
    : 'en';
};

export const messagesFor = (language: string): Messages =>
  catalogs[languageOf(language)];

const KEY = Symbol('i18n');

interface I18n {
  readonly m: Messages;
  readonly language: AdminLocale;
}

/** Called by a layout; `language` is read lazily, so the catalog follows navigation. */
export const provideI18n = (language: () => string) =>
  setContext<I18n>(KEY, {
    get m() {
      return messagesFor(language());
    },
    get language() {
      return languageOf(language());
    },
  });

/** The messages of the nearest layout that called `provideI18n`. */
export const useI18n = () => getContext<I18n | undefined>(KEY) ?? fallback;

const fallback: I18n = { m: en, language: 'en' };

export const roleLabel = (m: Messages, role: Role) => {
  if (!(ROLES as readonly string[]).includes(role)) return role;
  return (
    {
      administrator: m.roleAdministrator,
      editor: m.roleEditor,
      author: m.roleAuthor,
      contributor: m.roleContributor,
      subscriber: m.roleSubscriber,
    } as Record<string, string>
  )[role]!;
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
