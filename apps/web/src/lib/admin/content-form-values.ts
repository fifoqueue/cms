import type { SeoFormValues } from '#lib/admin/seo.js';

/** What the content form submitted, echoed back after a failed save so nothing typed is lost. */
export interface ContentFormValues {
  type: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  /** Parsed editor JSON, or `null` when it could not be read. */
  document: unknown;
  categoryIds: string[];
  parentId?: string;
  menuOrder?: number;
  tagIds: string[];
  extraTermIds?: string[];
  /** ISO time, or empty to keep the stored date. */
  publishedAt: string;
  sticky: boolean;
  allowComments: boolean;
  authorId: string;
  /** Empty removes the featured image. */
  featuredMediaId: string;
  /** Custom field values as submitted. */
  fields: Record<string, unknown>;
  /** Absent when the form had no SEO fieldset; the API then keeps the stored SEO. */
  seo?: SeoFormValues;
}
