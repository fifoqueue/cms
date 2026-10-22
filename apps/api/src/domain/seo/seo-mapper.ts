import { adminEntrySeoSchema, publicEntrySeoSchema } from '@cms/sdk';
import type { AdminEntrySeo, PublicEntrySeo } from '@cms/sdk';

/** Explicit public allowlist, also used before handing content to plugin filters. */
export const toPublicSeo = (seo: AdminEntrySeo): PublicEntrySeo =>
  publicEntrySeoSchema.parse({
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

export const toAdminSeo = (seo: AdminEntrySeo): AdminEntrySeo =>
  adminEntrySeoSchema.parse({
    ...toPublicSeo(seo),
    focusKeyword: seo.focusKeyword,
  });
