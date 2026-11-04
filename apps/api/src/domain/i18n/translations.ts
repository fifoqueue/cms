import { z } from 'zod';
import { translationManifest } from '@cms/sdk/i18n-manifest';
import { ADMIN_LOCALES } from '@cms/sdk/locales';
import type { TranslationScope } from '@cms/sdk/plugin';
import { parseInput } from '#api/shared/validation';

const localeSchema = z.enum(ADMIN_LOCALES);
const textSchema = z
  .string()
  .max(10000)
  .refine((text) => !/[<>]|\p{Cc}/u.test(text.replace(/[\n\t\r]/g, '')));

export const catalogSchema = (scope: TranslationScope) =>
  z.record(z.string(), textSchema).refine((messages) => {
    const keys: Readonly<Record<string, readonly string[]>> =
      translationManifest[scope];

    return Object.entries(messages).every(([key, value]) => {
      if (!Object.hasOwn(keys, key)) return false;

      const expected = [...keys[key]!].sort();
      const actual = [
        ...new Set(
          [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!),
        ),
      ].sort();

      return (
        actual.length === expected.length &&
        actual.every((name, index) => name === expected[index])
      );
    });
  });

export type TranslationCatalog = Partial<
  Record<TranslationScope, Record<string, string>>
>;

const registrationSchema = z.strictObject({
  site: catalogSchema('site').optional(),
  admin: catalogSchema('admin').optional(),
  email: catalogSchema('email').optional(),
});

export class Translations {
  private readonly entries = new Map<
    object,
    { locale: string; catalog: TranslationCatalog }
  >();

  private revision = 0;

  constructor(private readonly invalidate: () => void = () => {}) {}

  get version() {
    return this.revision;
  }

  get active() {
    return this.entries.size > 0;
  }

  register(locale: string, catalog: TranslationCatalog) {
    const language = parseInput(localeSchema, locale);
    const value = parseInput(registrationSchema, catalog);
    const token = {};

    this.entries.set(token, { locale: language, catalog: value });
    this.changed();

    return () => {
      if (this.entries.delete(token)) this.changed();
    };
  }

  messages(locale: string, scope: TranslationScope): Record<string, string> {
    const result: Record<string, string> = {};

    for (const entry of this.entries.values()) {
      if (entry.locale === locale) Object.assign(result, entry.catalog[scope]);
    }

    return result;
  }

  private changed() {
    this.revision += 1;
    this.invalidate();
  }
}
