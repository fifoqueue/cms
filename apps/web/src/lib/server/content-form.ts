import { fail } from '@sveltejs/kit';
import { contentInputSchema } from '@cms/sdk';
import type { FormFailure } from './errors';
import { text } from './errors';

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Reads `ContentForm.svelte` fields. Returns validated input or a 400 form failure. */
export const readContentForm = (form: FormData) => {
  const result = contentInputSchema.safeParse({
    type: text(form, 'type'),
    title: text(form, 'title'),
    slug: text(form, 'slug').trim() || undefined,
    excerpt: text(form, 'excerpt'),
    status: text(form, 'status'),
    document: parseJson(text(form, 'document')),
  });
  if (result.success) return { input: result.data };
  const issues = result.error.issues.map(({ path, message }) => ({
    path: path.map(String).join('.'),
    message,
  }));
  return {
    failure: fail(400, {
      message: 'Please fix the fields below',
      issues,
    } satisfies FormFailure),
  };
};
