import { adminEntrySeoSchema, publicEntrySeoSchema } from '@cms/sdk';
import type { AdminEntrySeo, PublicEntrySeo } from '@cms/sdk';

/** Shared scalar columns on content and terms; discovery never selects private fields. */
export const toSeoColumns = (seo: AdminEntrySeo) => ({
  seoTitle: seo.title,
  seoDescription: seo.description,
  seoCanonicalUrl: seo.canonicalUrl,
  seoNoIndex: seo.noIndex,
  seoNoFollow: seo.noFollow,
  seoImageUrl: seo.imageUrl,
  seoImageAlt: seo.imageAlt,
  seoSocialTitle: seo.socialTitle,
  seoSocialDescription: seo.socialDescription,
  seoSchemaType: seo.schemaType,
  seoAuthorName: seo.authorName,
  seoAuthorUrl: seo.authorUrl,
  seoFocusKeyword: seo.focusKeyword,
});

type SeoColumns = Omit<ReturnType<typeof toSeoColumns>, 'seoSchemaType'> & {
  seoSchemaType: string;
};

const publicFields = (row: Omit<SeoColumns, 'seoFocusKeyword'>) => ({
  title: row.seoTitle,
  description: row.seoDescription,
  canonicalUrl: row.seoCanonicalUrl,
  noIndex: row.seoNoIndex,
  noFollow: row.seoNoFollow,
  imageUrl: row.seoImageUrl,
  imageAlt: row.seoImageAlt,
  socialTitle: row.seoSocialTitle,
  socialDescription: row.seoSocialDescription,
  schemaType: row.seoSchemaType,
  authorName: row.seoAuthorName,
  authorUrl: row.seoAuthorUrl,
});

export const fromPublicSeoColumns = (
  row: Omit<SeoColumns, 'seoFocusKeyword'>,
): PublicEntrySeo => publicEntrySeoSchema.parse(publicFields(row));

export const fromSeoColumns = (row: SeoColumns): AdminEntrySeo =>
  adminEntrySeoSchema.parse({
    ...publicFields(row),
    focusKeyword: row.seoFocusKeyword,
  });
