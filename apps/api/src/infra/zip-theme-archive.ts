import { unzipSync } from 'fflate';
import type { ThemeArchive } from '#api/domain/theme/theme-archive';
import { isScreenshot, isThemeFile } from '#api/domain/theme/theme-archive';
import { invalidInput, Errors } from '#api/shared/errors';

/** Upload limits: the archive itself, each unpacked file and all unpacked files together. */
export const THEME_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024;
const FILE_MAX_BYTES = 256 * 1024;
const TOTAL_MAX_BYTES = 2 * 1024 * 1024;
const ENTRIES_MAX = 500;
/** The screenshot may be larger than a text file, but not by much. */
const SCREENSHOT_MAX_BYTES = 512 * 1024;

/** WordPress-style theme .zip files (fflate). Sizes are checked before anything is inflated. */
export const zipThemeArchive: ThemeArchive = {
  read(bytes) {
    if (bytes.byteLength > THEME_ARCHIVE_MAX_BYTES)
      throw invalidInput(Errors.ThemeArchiveTooLarge);
    let entries = 0;
    let total = 0;
    let tooLarge = false;
    let prefix: string | null = null;
    const relative = (name: string) =>
      prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
    let unpacked: Record<string, Uint8Array>;
    try {
      // Learn whether everything sits in one top-level folder (`my-theme/theme.json`).
      const names: string[] = [];
      unzipSync(bytes, {
        filter: (file) => {
          if (++entries <= ENTRIES_MAX) names.push(file.name);
          return false;
        },
      });
      const roots = new Set(names.map((name) => name.split('/')[0]));
      if (roots.size === 1 && names.some((name) => name.includes('/')))
        prefix = `${[...roots][0]}/`;
      unpacked = unzipSync(bytes, {
        filter: (file) => {
          const path = relative(file.name);
          const screenshot = isScreenshot(path);
          if (!screenshot && !isThemeFile(path)) return false;
          total += file.originalSize;
          if (
            file.originalSize >
              (screenshot ? SCREENSHOT_MAX_BYTES : FILE_MAX_BYTES) ||
            total > TOTAL_MAX_BYTES
          )
            tooLarge = true;
          return !tooLarge;
        },
      });
    } catch {
      throw invalidInput(Errors.ThemeArchiveInvalid);
    }
    if (entries > ENTRIES_MAX || tooLarge)
      throw invalidInput(Errors.ThemeArchiveTooLarge);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const files = new Map<string, string>();
    let screenshot: Uint8Array | null = null;
    for (const [name, data] of Object.entries(unpacked)) {
      const path = relative(name);
      if (isScreenshot(path)) {
        screenshot = data;
        continue;
      }
      try {
        files.set(path, decoder.decode(data));
      } catch {
        throw invalidInput(Errors.ThemeArchiveFile(path));
      }
    }
    return { files, screenshot };
  },
};
