import { contentInputSchema } from '@cms/sdk';
import type { ContentEntry } from '@cms/sdk';
import { BULK_STATUSES } from '#lib/admin/bulk-edit.js';
import { text } from '#lib/server/errors.js';

/** What Bulk Edit changes; anything absent stays as each entry has it. */
export interface BulkChanges {
  /** Added to each entry's categories and tags; nothing is removed. */
  categoryIds: string[];
  tagIds: string[];
  authorId?: string;
  status?: (typeof BULK_STATUSES)[number];
  allowComments?: boolean;
  sticky?: boolean;
}

const ids = (form: FormData, key: string) =>
  form
    .getAll(key)
    .filter((id): id is string => typeof id === 'string' && id !== '');

/** The Bulk Edit form; unknown choices mean "no change". */
export const readBulkChanges = (form: FormData): BulkChanges => {
  const flag = (key: string, on: string, off: string) =>
    text(form, key) === on ? true : text(form, key) === off ? false : undefined;
  return {
    categoryIds: ids(form, 'categoryIds'),
    tagIds: ids(form, 'tagIds'),
    authorId: text(form, 'authorId') || undefined,
    status: BULK_STATUSES.find((status) => status === text(form, 'status')),
    allowComments: flag('comments', 'open', 'closed'),
    sticky: flag('sticky', 'sticky', 'unsticky'),
  };
};

/**
 * The entry with the bulk changes applied, or null when the result is invalid (for example more
 * than 100 terms). The body, excerpt and title are copied unchanged and the API is told the
 * version they were read at (`expectedUpdatedAt`), so a newer save is never overwritten; slug, SEO,
 * fields, featured image, parent and password are omitted, which keeps them.
 */
export const bulkEditInput = (
  entry: ContentEntry,
  changes: BulkChanges,
  expectedUpdatedAt: string,
) => {
  const status = changes.status ?? entry.status;
  const result = contentInputSchema.safeParse({
    type: entry.type,
    title: entry.title,
    excerpt: entry.excerpt,
    document: entry.document,
    status,
    categoryIds: [
      ...new Set([
        ...entry.categories.map(({ id }) => id),
        ...changes.categoryIds,
      ]),
    ],
    tagIds: [
      ...new Set([...entry.tags.map(({ id }) => id), ...changes.tagIds]),
    ],
    extraTermIds: entry.extraTerms.map(({ id }) => id),
    // The API needs the date of a scheduled entry restated.
    publishedAt:
      status === 'scheduled' ? (entry.publishedAt ?? undefined) : undefined,
    sticky: changes.sticky ?? entry.sticky,
    allowComments: changes.allowComments ?? entry.allowComments,
    authorId: changes.authorId,
    expectedUpdatedAt,
    preserveAutosave: true,
  });
  return result.success ? result.data : null;
};
