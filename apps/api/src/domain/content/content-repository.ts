import type { ContentDocument, ContentStatus, ContentType } from '@cms/sdk';

export interface ContentRecord {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  excerpt: string;
  document: ContentDocument;
  html: string;
  status: ContentStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
}

export interface ContentCriteria {
  type?: ContentType;
  status?: ContentStatus;
  page: number;
  pageSize: number;
  /** Newest first by this field. */
  orderBy: 'publishedAt' | 'updatedAt';
}

export interface ContentRepository {
  findById(id: string): Promise<ContentRecord | null>;
  findBySlug(slug: string): Promise<ContentRecord | null>;
  list(
    criteria: ContentCriteria,
  ): Promise<{ items: ContentRecord[]; total: number }>;
  /** Throws `conflict` when the slug is taken. */
  insert(record: ContentRecord): Promise<void>;
  /** Throws `conflict` when the slug is taken. */
  update(record: ContentRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface DocumentRenderer {
  /** Throws `invalid_input` for documents outside the editor schema. */
  render(document: ContentDocument): string;
}
