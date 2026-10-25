import { fail } from '@sveltejs/kit';
import { parseBlocks } from '@cms/sdk';
import type { AdminTheme, Block, SiteFont, SiteFontsInput } from '@cms/sdk';
import type { FormFailure } from '#lib/server/errors.js';
import { Errors as SdkErrors } from '@cms/sdk/errors';
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
  screenshot,
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
  /** Admin-only address of the theme's screenshot (versioned for caching), or null. */
  screenshot:
    screenshot &&
    `/admin/appearance/screenshot/${encodeURIComponent(id)}?v=${encodeURIComponent(screenshot)}`,
});

const invalid = (message: string, issues?: FormFailure['issues']) =>
  fail(400, { message, issues } satisfies FormFailure);

/** Reads an uploaded theme archive; the API unpacks and validates it. */
export const readThemeUpload = async (upload: FormDataEntryValue | null) => {
  if (!(upload instanceof File) || upload.size === 0)
    return { failure: invalid(Errors.ThemeFileRequired) };
  if (upload.size > MAX_THEME_BYTES)
    return { failure: invalid(SdkErrors.ThemeArchiveTooLarge) };
  return { archive: new Uint8Array(await upload.arrayBuffer()) };
};

type FontInput = SiteFontsInput['fonts'][number];
type FaceInput = NonNullable<FontInput['faces']>[number];

/** A slug from a family name (`Nanum Gothic` → `nanum-gothic`). */
const fontSlug = (family: string) =>
  family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'font';

const field = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * The site fonts after the Styles form's change: `op=remove` drops `slug`; `op=add` adds a
 * family from a stylesheet address or one font file, or adds the face to a file-based family of
 * the same name. Values are passed on unchecked: the API validates the whole list.
 */
export const fontsAfter = (
  fonts: SiteFont[],
  form: FormData,
): FontInput[] | null => {
  const op = field(form, 'op');
  if (op === 'remove')
    return fonts.filter((font) => font.slug !== field(form, 'slug'));
  if (op !== 'add') return null;
  const family = field(form, 'family');
  const face = {
    src: field(form, 'src'),
    weight: Number(field(form, 'weight') || 400),
    style: field(form, 'style') === 'italic' ? 'italic' : 'normal',
    display: (field(form, 'display') || 'swap') as FaceInput['display'],
  } satisfies FaceInput;
  const existing = fonts.find(
    (font) => font.family.toLowerCase() === family.toLowerCase(),
  );
  if (field(form, 'source') !== 'stylesheet' && existing?.faces.length)
    return fonts.map((font) =>
      font === existing
        ? {
            ...font,
            faces: [...font.faces, face],
          }
        : font,
    );
  return [
    ...fonts,
    {
      slug: fontSlug(family),
      family,
      fallback: field(form, 'fallback') || 'sans-serif',
      ...(field(form, 'source') === 'stylesheet'
        ? { stylesheet: field(form, 'stylesheet') }
        : { faces: [face] }),
    } satisfies FontInput,
  ];
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
