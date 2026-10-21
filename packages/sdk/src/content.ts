import { z } from 'zod';
import { KEBAB_CASE } from './common';

export const CONTENT_TYPES = ['post', 'page'] as const;
export const CONTENT_STATUSES = ['draft', 'published'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Tiptap (ProseMirror) JSON. The node structure is checked against the editor schema by the API. */
export const contentDocumentSchema = z.looseObject({
  type: z.literal('doc'),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type ContentDocument = z.infer<typeof contentDocumentSchema>;

export const contentInputSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().trim().min(1).max(255),
  slug: z.string().trim().toLowerCase().max(191).regex(KEBAB_CASE).optional(),
  excerpt: z.string().trim().max(1000).default(''),
  document: contentDocumentSchema,
  status: z.enum(CONTENT_STATUSES).default('draft'),
});

/** What clients send when creating or replacing content. */
export type ContentInput = z.input<typeof contentInputSchema>;
/** Validated content input, with defaults applied. */
export type ContentData = z.output<typeof contentInputSchema>;

export const contentListQuerySchema = z.object({
  type: z.enum(CONTENT_TYPES).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export type ContentListQuery = z.input<typeof contentListQuerySchema>;

/** Full content record, visible to authenticated users only. */
export interface ContentEntry {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  excerpt: string;
  document: ContentDocument;
  html: string;
  status: ContentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
}

/** Published content as served by the public API. */
export interface PublicContent {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  excerpt: string;
  html: string;
  publishedAt: string;
  updatedAt: string;
  /**
   * Data added by plugins through the `content.public` filter. Values must be JSON data
   * (`isJsonValue`); otherwise the filter result is discarded. Frontends must tolerate any shape.
   */
  meta: Record<string, unknown>;
}
