import { fail } from '@sveltejs/kit';
import { contentInputSchema } from '@cms/sdk';
import type { ContentEntry } from '@cms/sdk';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors, issuesOf, text } from '#lib/server/errors.js';

const ids = (form: FormData, key: string) =>
  form.getAll(key).filter((id) => typeof id === 'string');

/**
 * The entry with the Quick Edit fields replaced. The body, excerpt, SEO, custom fields, featured
 * image and parent are omitted or copied, so the API keeps them; custom terms are copied because
 * Quick Edit does not show them. A blank password keeps the stored one, a blank author the
 * current author. A blank date keeps the stored one; a scheduled entry resends it, since the
 * API needs a date for `scheduled`. `updatedAt` is the version the list showed: the API refuses
 * the save when the entry changed since, so the copied body never overwrites a newer one.
 */
export const readQuickEdit = (entry: ContentEntry, form: FormData) => {
  const result = contentInputSchema.safeParse({
    type: entry.type,
    title: text(form, 'title'),
    slug: text(form, 'slug').trim() || undefined,
    excerpt: entry.excerpt,
    document: entry.document,
    status: text(form, 'status'),
    categoryIds: ids(form, 'categoryIds'),
    tagIds: ids(form, 'tagIds'),
    extraTermIds: entry.extraTerms.map(({ id }) => id),
    publishedAt:
      text(form, 'publishedAt') ||
      (text(form, 'status') === 'scheduled'
        ? (entry.publishedAt ?? undefined)
        : undefined),
    expectedUpdatedAt: text(form, 'updatedAt'),
    // The API refuses while the user has unsaved editor text, atomically with the save.
    preserveAutosave: true,
    sticky: form.has('sticky'),
    allowComments: form.has('allowComments'),
    password: text(form, 'password') || undefined,
    authorId: text(form, 'authorId') || undefined,
  });
  if (result.success) return { input: result.data };
  return {
    failure: fail(400, {
      quickEdit: entry.id,
      message: Errors.FormInvalid,
      issues: issuesOf(result.error.issues),
    } satisfies FormFailure & { quickEdit: string }),
  };
};
