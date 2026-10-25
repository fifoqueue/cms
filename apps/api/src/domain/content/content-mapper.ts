import type {
  AdminContentSummary,
  ContentEntry,
  PublicContent,
  PublicContentSummary,
  TermSummary,
} from '@cms/sdk';
import {
  adminContentSchema,
  adminContentSummarySchema,
  publicContentSchema,
  publicContentSummarySchema,
  toPublicEntrySeo,
  can,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type {
  ContentRecord,
  ContentSummaryRecord,
} from '#api/domain/content/content-repository';
import type {
  PublishedRecord,
  PublishedSummaryRecord,
} from '#api/domain/content/published-content-repository';
import { toAdminSeo } from '#api/domain/seo/seo-mapper';

// Every DTO lists its fields explicitly, so nothing stored leaks into a response.
const toTerm = ({ id, name, slug }: TermSummary): TermSummary => ({
  id,
  name,
  slug,
});

const entryFields = (record: ContentSummaryRecord) => ({
  id: record.id,
  type: record.type,
  slug: record.slug,
  path: record.path,
  title: record.title,
  excerpt: record.excerpt,
  status: record.status,
  publishedAt: record.publishedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  trashedAt: record.trashedAt?.toISOString() ?? null,
  parentId: record.parentId ?? null,
  authorId: record.authorId,
  authorName: record.authorName,
  sticky: record.sticky,
  allowComments: record.allowComments,
  tocOverride: record.tocOverride ?? 'default',
  menuOrder: record.menuOrder ?? 0,
  commentCount: record.commentCount,
  protected: record.passwordHash !== null,
  featuredMediaId: record.featuredMediaId,
  featuredImage: record.featuredImage,
  extraTerms: (record.extraTerms ?? []).map(({ id, name, slug, taxonomy }) => ({
    id,
    name,
    slug,
    taxonomy,
  })),
  categories: record.categories.map(toTerm),
  tags: record.tags.map(toTerm),
  seo: toAdminSeo(record.seo),
});

export const toEntry = (record: ContentRecord, actor?: Actor): ContentEntry =>
  adminContentSchema.parse({
    ...entryFields(record),
    origin:
      actor && can(actor, 'content.editOthers')
        ? {
            created: {
              ip: record.createdIp ?? null,
              userAgent: record.createdUserAgent ?? null,
            },
            modified: {
              ip: record.modifiedIp ?? null,
              userAgent: record.modifiedUserAgent ?? null,
            },
          }
        : null,
    document: record.document,
    html: record.html,
    fields: record.fields,
  });

export const toEntrySummary = (
  record: ContentSummaryRecord,
): AdminContentSummary => adminContentSummarySchema.parse(entryFields(record));

/** `unlocked`: the visitor proved the password, so a protected body may be shown. */
const publicFields = (record: PublishedSummaryRecord, unlocked: boolean) => ({
  id: record.id,
  type: record.type,
  slug: record.slug,
  path: record.path,
  title: record.title,
  excerpt:
    record.protected && !unlocked ? '' : record.excerpt || record.summary,
  author: record.author,
  parentId: record.parentId ?? null,
  sticky: record.sticky,
  // Locked discussions stay private: the count would reveal activity without the password.
  commentCount: record.protected && !unlocked ? 0 : record.commentCount,
  featuredImage: record.featuredImage,
  protected: record.protected && !unlocked,
  publishedAt: (record.publishedAt ?? record.updatedAt).toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  extraTerms: (record.extraTerms ?? []).map(({ id, name, slug, taxonomy }) => ({
    id,
    name,
    slug,
    taxonomy,
  })),
  categories: record.categories.map(toTerm),
  tags: record.tags.map(toTerm),
  seo: toPublicEntrySeo(record.seo),
  meta: {},
});

/** A protected body stays empty unless `unlocked`. */
export const toPublic = (
  record: PublishedRecord,
  unlocked = false,
): PublicContent =>
  publicContentSchema.parse({
    ...publicFields(record, unlocked),
    html: record.protected && !unlocked ? '' : record.html,
    // Filled with the public fields by `PublicContentService`.
    fields: {},
  });

export const toPublicSummary = (
  record: PublishedSummaryRecord,
): PublicContentSummary =>
  publicContentSummarySchema.parse(publicFields(record, false));
