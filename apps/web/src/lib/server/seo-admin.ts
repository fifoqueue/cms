import { fail } from '@sveltejs/kit';
import {
  PERMALINK_CONTENT_TYPES,
  permalinkSettingsSchema,
  seoSettingsSchema,
} from '@cms/sdk';
import type { AdminEntrySeo, PermalinkSettings } from '@cms/sdk';
import type {
  SeoFormValues,
  SeoPreviewContext,
  SeoSettingsFormValues,
} from '#lib/admin/seo.js';
import { SEO_FIELDSET, seoField } from '#lib/admin/seo.js';
import { contentApi } from '#lib/server/api.js';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors, text } from '#lib/server/errors.js';

interface AdminEvent {
  fetch: typeof globalThis.fetch;
  locals: App.Locals;
}

const issuesOf = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.map(({ path, message }) => ({
    path: path.map(String).join('.'),
    message,
  }));

/** The SEO fields admin pages show, mapped explicitly from the admin DTO. */
export const adminSeoView = (seo: AdminEntrySeo): AdminEntrySeo => ({
  title: seo.title,
  description: seo.description,
  canonicalUrl: seo.canonicalUrl,
  noIndex: seo.noIndex,
  noFollow: seo.noFollow,
  imageUrl: seo.imageUrl,
  imageAlt: seo.imageAlt,
  socialTitle: seo.socialTitle,
  socialDescription: seo.socialDescription,
  schemaType: seo.schemaType,
  authorName: seo.authorName,
  authorUrl: seo.authorUrl,
  focusKeyword: seo.focusKeyword,
});

/**
 * Reads `SeoEditor.svelte` fields: the full SEO object, or `undefined` when the form had no SEO
 * fieldset (so an update keeps the stored metadata). Only the declared keys are read.
 */
export const readSeoForm = (form: FormData): SeoFormValues | undefined => {
  if (!form.has(SEO_FIELDSET)) return undefined;
  const field = (key: keyof AdminEntrySeo) => text(form, seoField(key));
  return {
    title: field('title'),
    description: field('description'),
    canonicalUrl: field('canonicalUrl'),
    noIndex: form.has(seoField('noIndex')),
    noFollow: form.has(seoField('noFollow')),
    imageUrl: field('imageUrl'),
    imageAlt: field('imageAlt'),
    socialTitle: field('socialTitle'),
    socialDescription: field('socialDescription'),
    schemaType: field('schemaType'),
    authorName: field('authorName'),
    authorUrl: field('authorUrl'),
    focusKeyword: field('focusKeyword'),
  };
};

/** Saved settings the content and term editors preview against. */
export const loadSeoContext = async (
  event: AdminEvent,
): Promise<SeoPreviewContext> => {
  // Public settings: every writer previews SEO, not only those who may change the settings.
  const api = contentApi(event.fetch);
  const [settings, permalinks, site] = await Promise.all([
    api.seo.settings(),
    api.permalinks.settings(),
    api.site(),
  ]);
  return {
    siteTitle: site.title,
    siteDescription: site.description,
    siteUrl: settings.siteUrl,
    titleTemplate: settings.titleTemplate,
    defaultImageUrl: settings.defaultImageUrl,
    defaultImageAlt: settings.defaultImageAlt,
    indexingEnabled: settings.indexingEnabled,
    indexCategories: settings.indexCategories,
    indexTags: settings.indexTags,
    permalinks: permalinkView(permalinks),
  };
};

/** Template strings by type key, nothing else. */
export const permalinkView = (settings: PermalinkSettings): PermalinkSettings =>
  Object.fromEntries(
    Object.entries(settings).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );

const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Empty number fields mean "no limit" (-1), as the form explains. */
const limit = (value: string) => (value.trim() ? Number(value) : -1);

/** Reads the SEO settings form. Only the declared settings are read and echoed. */
export const readSeoSettingsForm = (form: FormData) => {
  const flag = (key: keyof SeoSettingsFormValues) => form.has(key);
  const values: SeoSettingsFormValues = {
    siteUrl: text(form, 'siteUrl'),
    titleTemplate: text(form, 'titleTemplate'),
    homeTitle: text(form, 'homeTitle'),
    homeDescription: text(form, 'homeDescription'),
    defaultImageUrl: text(form, 'defaultImageUrl'),
    defaultImageAlt: text(form, 'defaultImageAlt'),
    entityType: text(form, 'entityType'),
    entityName: text(form, 'entityName'),
    logoUrl: text(form, 'logoUrl'),
    sameAs: text(form, 'sameAs'),
    twitterHandle: text(form, 'twitterHandle'),
    indexingEnabled: flag('indexingEnabled'),
    indexCategories: flag('indexCategories'),
    indexTags: flag('indexTags'),
    allowAiSearch: flag('allowAiSearch'),
    allowAiTraining: flag('allowAiTraining'),
    llmsTxtEnabled: flag('llmsTxtEnabled'),
    llmsIntro: text(form, 'llmsIntro'),
    googleVerification: text(form, 'googleVerification'),
    bingVerification: text(form, 'bingVerification'),
    maxSnippet: text(form, 'maxSnippet'),
    maxImagePreview: text(form, 'maxImagePreview'),
    maxVideoPreview: text(form, 'maxVideoPreview'),
  };
  const result = seoSettingsSchema.safeParse({
    ...values,
    sameAs: lines(values.sameAs),
    maxSnippet: limit(values.maxSnippet),
    maxVideoPreview: limit(values.maxVideoPreview),
  });
  if (result.success) return { values, input: result.data };
  return {
    values,
    failure: fail(400, {
      intent: 'settings' as const,
      values,
      message: Errors.FormInvalid,
      issues: issuesOf(result.error.issues),
    } satisfies FormFailure & {
      intent: 'settings';
      values: SeoSettingsFormValues;
    }),
  };
};

/** Reads the permalink form: one pattern per content type. */
/** One template per type key; an empty custom type template falls back to `/<key>/%slug%`. */
export const readPermalinkForm = (form: FormData, types: readonly string[]) => {
  const values: PermalinkSettings = Object.fromEntries(
    types
      .map((type) => [type, text(form, type).trim()] as const)
      .filter(
        ([type, pattern]) =>
          pattern || PERMALINK_CONTENT_TYPES.includes(type as never),
      ),
  );
  const result = permalinkSettingsSchema.safeParse(values);
  if (result.success) return { values, input: result.data };
  return {
    values,
    failure: fail(400, {
      intent: 'permalinks' as const,
      permalinks: values,
      message: Errors.PermalinkPatternsInvalid,
      issues: issuesOf(result.error.issues),
    } satisfies FormFailure & {
      intent: 'permalinks';
      permalinks: PermalinkSettings;
    }),
  };
};
