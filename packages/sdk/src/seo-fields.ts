// Pure SEO projections, safe for browser bundles: explicit field allowlists, no runtime schemas.
import type {
  AdminEntrySeo,
  PublicEntrySeo,
  PublicSeoSettings,
} from '#sdk/seo';

/** Published entry metadata, field by field; editorial keywords are not public. */
export const publicEntrySeoFields = (seo: PublicEntrySeo): PublicEntrySeo => ({
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
});

/** The published fields plus the editorial focus keyword. */
export const adminEntrySeoFields = (seo: AdminEntrySeo): AdminEntrySeo => ({
  ...publicEntrySeoFields(seo),
  focusKeyword: seo.focusKeyword,
});

/** Site-wide display and crawler policy, field by field; never credentials or account data. */
export const publicSeoSettingsFields = (
  settings: PublicSeoSettings,
): PublicSeoSettings => ({
  siteUrl: settings.siteUrl,
  titleTemplate: settings.titleTemplate,
  homeTitle: settings.homeTitle,
  homeDescription: settings.homeDescription,
  defaultImageUrl: settings.defaultImageUrl,
  defaultImageAlt: settings.defaultImageAlt,
  entityType: settings.entityType,
  entityName: settings.entityName,
  logoUrl: settings.logoUrl,
  sameAs: settings.sameAs,
  twitterHandle: settings.twitterHandle,
  indexingEnabled: settings.indexingEnabled,
  indexCategories: settings.indexCategories,
  indexTags: settings.indexTags,
  allowAiSearch: settings.allowAiSearch,
  allowAiTraining: settings.allowAiTraining,
  llmsTxtEnabled: settings.llmsTxtEnabled,
  llmsIntro: settings.llmsIntro,
  googleVerification: settings.googleVerification,
  bingVerification: settings.bingVerification,
  maxSnippet: settings.maxSnippet,
  maxImagePreview: settings.maxImagePreview,
  maxVideoPreview: settings.maxVideoPreview,
});
