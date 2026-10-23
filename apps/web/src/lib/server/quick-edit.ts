import { fail } from '@sveltejs/kit';
import { contentInputSchema } from '@cms/sdk';
import type { ContentEntry } from '@cms/sdk';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors, text } from '#lib/server/errors.js';

const ids = (form: FormData, key: string) =>
  form.getAll(key).filter((id) => typeof id === 'string');

/**
 * The entry with the Quick Edit fields replaced. The body, excerpt, SEO, custom fields, featured
 * image, parent and custom terms are omitted or copied, so the API keeps them. A blank password
 * or date keeps the stored one; a blank author keeps the current author.
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
    publishedAt: text(form, 'publishedAt') || undefined,
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
      issues: result.error.issues.map(({ path, message }) => ({
        path: path.map(String).join('.'),
        message,
      })),
    } satisfies FormFailure & { quickEdit: string }),
  };
};
