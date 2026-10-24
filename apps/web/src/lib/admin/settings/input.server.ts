import { text } from '#lib/server/errors.js';

/** Removal wins; an empty field preserves the stored secret. */
export const secretInput = (
  form: FormData,
  name: string,
  removeName: string,
) => {
  const value = text(form, name);
  return form.has(removeName) ? '' : value || undefined;
};
