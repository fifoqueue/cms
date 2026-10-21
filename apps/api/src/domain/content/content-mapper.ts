import type { ContentEntry, PublicContent } from '@cms/sdk';
import type { ContentRecord } from './content-repository';

export const toEntry = (record: ContentRecord): ContentEntry => ({
  ...record,
  publishedAt: record.publishedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const toPublic = (record: ContentRecord): PublicContent => ({
  id: record.id,
  type: record.type,
  slug: record.slug,
  title: record.title,
  excerpt: record.excerpt,
  html: record.html,
  publishedAt: (record.publishedAt ?? record.updatedAt).toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  meta: {},
});
