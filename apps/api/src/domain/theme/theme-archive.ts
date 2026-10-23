import { invalidInput, Errors } from '#api/shared/errors';

/** What an archive holds: text files by path and an optional `screenshot.png`/`.webp`. */
export interface ThemeArchiveContents {
  files: Map<string, string>;
  /** Unchecked bytes; the theme service sniffs them. */
  screenshot: Uint8Array | null;
}

/** Unpacks an uploaded theme archive into its files, by path inside the theme. */
export interface ThemeArchive {
  /**
   * Paths are relative to the theme root (a single top-level folder is removed). Throws
   * `invalid_input` for anything that is not a small, well-formed archive.
   */
  read(bytes: Uint8Array): ThemeArchiveContents;
}

/** The optional preview image (WordPress `screenshot.png`). */
export const isScreenshot = (path: string) =>
  path === 'screenshot.png' || path === 'screenshot.webp';

/** The files a theme may contain; everything else in an archive (images, readme) is ignored. */
export const isThemeFile = (path: string) =>
  path === 'theme.json' ||
  path === 'style.css' ||
  /^parts\/[a-z0-9-]+\.json$/.test(path) ||
  // Template names may end in a Unicode slug (`page-소식`); the theme schema validates them.
  /^templates\/[\p{L}\p{N}\p{M}-]+\.json$/u.test(path);

const parseJson = (path: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw invalidInput(Errors.ThemeArchiveFile(path));
  }
};

const fileName = (path: string) =>
  path.slice(path.indexOf('/') + 1, -'.json'.length);

/**
 * Turns archive files into the input of `themePackageSchema`: `theme.json` is the manifest,
 * `templates/<name>.json` and `parts/<slug>.json` are block lists, `style.css` the stylesheet.
 */
export const packageFromFiles = (files: Map<string, string>) => {
  const manifest = files.get('theme.json');
  if (manifest === undefined) throw invalidInput(Errors.ThemeArchiveMissing);
  const templates: Record<string, unknown> = {};
  const parts: Record<string, unknown> = {};
  for (const [path, text] of files) {
    if (path.startsWith('templates/'))
      templates[fileName(path)] = parseJson(path, text);
    else if (path.startsWith('parts/'))
      parts[fileName(path)] = parseJson(path, text);
  }
  return {
    manifest: parseJson('theme.json', manifest),
    templates,
    parts,
    css: files.get('style.css') ?? '',
  };
};
