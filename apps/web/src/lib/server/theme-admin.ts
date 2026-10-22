import { fail } from '@sveltejs/kit';
import { parseBlocks } from '@cms/sdk';
import type { AdminTheme, Block } from '@cms/sdk';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors } from '#lib/server/errors.js';

/** Largest theme archive accepted (the API enforces the same limit). */
export const MAX_THEME_BYTES = 2 * 1024 * 1024;

/** The theme fields the Appearance page shows. */
export const adminThemeView = ({
  id,
  name,
  version,
  description,
  author,
  palette,
  templateCount,
  active,
  builtin,
  customized,
}: AdminTheme) => ({
  id,
  name,
  version,
  description,
  author,
  palette: palette.map(({ slug, name, color }) => ({ slug, name, color })),
  templateCount,
  active,
  builtin,
  customized,
});

const invalid = (message: string, issues?: FormFailure['issues']) =>
  fail(400, { message, issues } satisfies FormFailure);

/** Reads an uploaded theme archive; the API unpacks and validates it. */
export const readThemeUpload = async (upload: FormDataEntryValue | null) => {
  if (!(upload instanceof File) || upload.size === 0)
    return { failure: invalid(Errors.ThemeFileRequired) };
  if (upload.size > MAX_THEME_BYTES)
    return { failure: invalid(Errors.ThemeFileTooLarge) };
  return { archive: new Uint8Array(await upload.arrayBuffer()) };
};

/**
 * Reads the site editor's block tree (JSON in a form field) and checks it with the shared block
 * schema before it goes to the API.
 */
export const readBlocks = (
  value: FormDataEntryValue | null,
): { blocks: Block[] } | { failure: ReturnType<typeof invalid> } => {
  let data: unknown;
  try {
    data = JSON.parse(typeof value === 'string' ? value : '');
  } catch {
    return { failure: invalid(Errors.BlocksInvalid) };
  }
  const { blocks, issues } = parseBlocks(data);
  return issues.length
    ? { failure: invalid(Errors.BlocksInvalid, issues.slice(0, 20)) }
    : { blocks };
};
