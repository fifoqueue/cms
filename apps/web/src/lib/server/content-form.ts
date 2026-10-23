import { fail } from '@sveltejs/kit';
import { contentInputSchema } from '@cms/sdk';
import type { FieldDefinition } from '@cms/sdk';
import type { ContentFormValues } from '#lib/admin/content-form-values.js';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors, text } from '#lib/server/errors.js';
import type { adminApi } from '#lib/server/api.js';
import { readSeoForm } from '#lib/server/seo-admin.js';

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const ids = (form: FormData, key: string) => [
  ...new Set(
    form
      .getAll(key)
      .filter((value): value is string => typeof value === 'string')
      .filter(Boolean),
  ),
];

/**
 * Reads `ContentForm.svelte` fields. Returns validated input plus the submitted values (echoed
 * back on failure so nothing typed is lost), or a 400 form failure carrying those values.
 */
/** `field.<key>` inputs of the definitions that apply to `type`, typed per field kind. */
const readFields = (
  form: FormData,
  type: string,
  definitions: readonly FieldDefinition[],
) =>
  Object.fromEntries(
    definitions
      .filter((field) => field.contentTypes.includes(type))
      .flatMap((field): [string, unknown][] => {
        const name = `field.${field.key}`;
        if (field.type === 'boolean') return [[field.key, form.has(name)]];
        const raw = text(form, name).trim();
        if (!raw) return [];
        if (field.type === 'number') {
          const value = Number(raw);
          return [[field.key, Number.isFinite(value) ? value : raw]];
        }
        return [[field.key, raw]];
      }),
  );

export const readContentForm = (
  form: FormData,
  definitions: readonly FieldDefinition[] = [],
) => {
  const values: ContentFormValues = {
    type: text(form, 'type'),
    title: text(form, 'title'),
    slug: text(form, 'slug'),
    excerpt: text(form, 'excerpt'),
    status: text(form, 'status'),
    document: parseJson(text(form, 'document')),
    categoryIds: ids(form, 'categoryIds'),
    parentId: text(form, 'parentId'),
    ...(form.has('menuOrder') && {
      menuOrder: Number(text(form, 'menuOrder')),
    }),
    tagIds: ids(form, 'tagIds'),
    extraTermIds: ids(form, 'extraTermIds'),
    publishedAt: text(form, 'publishedAt'),
    sticky: form.has('sticky'),
    allowComments: form.has('allowComments'),
    authorId: text(form, 'authorId'),
    featuredMediaId: text(form, 'featuredMediaId'),
    fields: readFields(form, text(form, 'type'), definitions),
    seo: readSeoForm(form),
  };
  // The password is never echoed back; empty keeps the stored one unless removal is asked for.
  const password = form.has('removePassword')
    ? ''
    : text(form, 'password') || undefined;
  const result = contentInputSchema.safeParse({
    ...values,
    parentId: form.has('parentId') ? values.parentId || null : undefined,
    slug: values.slug.trim() || undefined,
    publishedAt: values.publishedAt || undefined,
    authorId: values.authorId || undefined,
    // The form always carries the field: empty means no featured image.
    featuredMediaId: form.has('featuredMediaId')
      ? values.featuredMediaId || null
      : undefined,
    password,
    // The version the editor loaded; the API refuses the save if it changed since.
    expectedUpdatedAt: text(form, 'updatedAt') || undefined,
  });
  if (result.success) return { input: result.data, values };
  const issues = result.error.issues.map(({ path, message }) => ({
    path: path.map(String).join('.'),
    message,
  }));
  return {
    failure: fail(400, {
      message: Errors.FormInvalid,
      issues,
      values,
    } satisfies FormFailure & { values: ContentFormValues }),
  };
};

/** Thumbnail addresses of an entry's image field values, so the editor can show them. */
export const fieldImages = async (
  admin: ReturnType<typeof adminApi>,
  definitions: readonly FieldDefinition[],
  values: Record<string, unknown>,
) =>
  Object.fromEntries(
    await Promise.all(
      definitions.flatMap((field) => {
        const id = values[field.key];
        if (field.type !== 'image' || typeof id !== 'string') return [];
        return [
          admin.media
            .get(id)
            .then(
              (media) =>
                media.variants.find((variant) => variant.name === 'thumbnail')
                  ?.url ?? media.url,
            )
            // A deleted file shows no preview; the field still holds its id.
            .catch(() => '')
            .then((url) => [field.key, url] as const),
        ];
      }),
    ),
  );
