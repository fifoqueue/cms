import {
  adminEntrySeoSchema,
  publicEntrySeoFields,
  publicEntrySeoSchema,
} from '@cms/sdk';
import type { AdminEntrySeo, PublicEntrySeo } from '@cms/sdk';

/** Explicit public allowlist, also used before handing content to plugin filters. */
export const toPublicSeo = (seo: AdminEntrySeo): PublicEntrySeo =>
  publicEntrySeoSchema.parse(publicEntrySeoFields(seo));

export const toAdminSeo = (seo: AdminEntrySeo): AdminEntrySeo =>
  adminEntrySeoSchema.parse({
    ...toPublicSeo(seo),
    focusKeyword: seo.focusKeyword,
  });
