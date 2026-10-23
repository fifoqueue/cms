import type {
  ContentType,
  PublicEntrySeo,
  PublicImage,
  TermSummary,
} from '@cms/sdk';
import type { ContentCriteria } from '#api/domain/content/content-repository';

/**
 * Published content as read for public output. Never carries the editor document, search
 * text, author id, status, creation time, password hash or private SEO, so public reads
 * neither fetch nor parse them.
 */
export interface PublishedRecord {
  id: string;
  type: ContentType;
  slug: string;
  path: string;
  title: string;
  excerpt: string;
  html: string;
  publishedAt: Date | null;
  updatedAt: Date;
  extraTerms?: (TermSummary & { taxonomy: string })[];
  categories: TermSummary[];
  tags: TermSummary[];
  author: { name: string; slug: string } | null;
  sticky: boolean;
  /** Approved comments. */
  commentCount: number;
  /** Whether a password protects the body. */
  protected: boolean;
  /** Generated excerpt, used when `excerpt` is empty. */
  summary: string;
  featuredImage: PublicImage | null;
  /** Stored custom field values, public or not; filter before serving. */
  fields: Record<string, unknown>;
  seo: PublicEntrySeo;
}

/** A list item: the published record without the rendered body. */
export type PublishedSummaryRecord = Omit<PublishedRecord, 'html' | 'fields'>;

/** `ContentCriteria` filters without a status: only published content is ever matched. */
export type PublishedCriteria = Pick<
  ContentCriteria,
  | 'taxonomy'
  | 'term'
  | 'type'
  | 'types'
  | 'search'
  | 'category'
  | 'tag'
  | 'author'
  | 'sticky'
  | 'year'
  | 'month'
  | 'page'
  | 'pageSize'
>;

/** Read-only view of published content; drafts are filtered by the store and never returned. */
export interface PublishedContentRepository {
  /** Private, non-trashed entry with the same public projection; caller must authorize. */
  privateById(id: string): Promise<PublishedRecord | null>;
  byId(id: string): Promise<PublishedRecord | null>;
  bySlug(slug: string): Promise<PublishedRecord | null>;
  /** Public entries among `ids`, without bodies; missing or unpublished ids are left out. */
  summariesByIds(ids: readonly string[]): Promise<PublishedSummaryRecord[]>;
  /** The password hash of a public entry, to verify unlock proofs. */
  passwordHash(id: string): Promise<string | null>;
  /** Newest `publishedAt` first, then by id; `total` counts every match. */
  list(
    criteria: PublishedCriteria,
  ): Promise<{ items: PublishedRecord[]; total: number }>;
  /** Months with public entries of `types` (UTC), newest first, at most `limit`. */
  months(
    types: readonly string[],
    limit: number,
  ): Promise<{ year: number; month: number; count: number }[]>;
  /** Same selection and order as `list`, without reading the body. */
  summaries(
    criteria: PublishedCriteria,
  ): Promise<{ items: PublishedSummaryRecord[]; total: number }>;
}
