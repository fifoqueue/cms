import { z } from 'zod';
import { ADMIN_LOCALES } from '@cms/sdk/locales';
import type { I18nFilterHooks, TranslationScope } from '@cms/sdk/plugin';
import { catalogSchema } from '#api/domain/i18n/translations';
import type { Translations } from '#api/domain/i18n/translations';

interface Hooks {
  readonly version?: number;
  has(name: string): boolean;
  applyFilter<K extends keyof I18nFilterHooks>(
    name: K,
    value: I18nFilterHooks[K],
    accept: (value: unknown) => boolean,
  ): Promise<I18nFilterHooks[K]>;
}

export class I18nService {
  get active() {
    return (
      this.translations.active ||
      this.hooks.has('i18n.messages') ||
      this.hooks.has('i18n.locale')
    );
  }

  get version() {
    return `${this.translations.version}:${this.hooks.version ?? 0}`;
  }

  constructor(
    private readonly translations: Translations,
    private readonly hooks: Hooks,
  ) {}

  async locale(
    locale: string,
    scope: TranslationScope,
    userId: string | null = null,
  ): Promise<string> {
    if (!this.hooks.has('i18n.locale')) return locale;

    const schema = z.strictObject({
      locale: z.enum(ADMIN_LOCALES),
      scope: z.literal(scope),
      userId: userId === null ? z.null() : z.literal(userId),
    });
    const result = await this.hooks.applyFilter(
      'i18n.locale',
      { locale, scope, userId },
      (value) => schema.safeParse(value).success,
    );

    return result.locale;
  }

  async messages(locale: string, scope: TranslationScope) {
    const messages = this.translations.active
      ? this.translations.messages(locale, scope)
      : {};

    if (!this.hooks.has('i18n.messages')) return messages;

    const schema = z.strictObject({
      locale: z.literal(locale),
      scope: z.literal(scope),
      messages: catalogSchema(scope),
    });
    const result = await this.hooks.applyFilter(
      'i18n.messages',
      { locale, scope, messages },
      (value) => schema.safeParse(value).success,
    );

    return result.messages;
  }
}
