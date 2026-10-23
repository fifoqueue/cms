import type { SettingsRepository } from '#api/domain/site/site-service';
import { sniffMediaType } from '#api/domain/media/sniff';
import type { ImageProcessor } from '#api/domain/media/ports';
import { invalidInput, Errors } from '#api/shared/errors';

const INDEX_KEY = 'themes.screenshots';
const keyOf = (id: string) => `themes.screenshot.${id}`;

/** Image types a theme screenshot may have, by its content. */
const TYPES = ['image/png', 'image/webp'] as const;
type ScreenshotType = (typeof TYPES)[number];

/** A short fingerprint for cache busting (FNV-1a); not a security measure. */
const fingerprint = (bytes: Uint8Array) => {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return `${(hash >>> 0).toString(36)}${bytes.length.toString(36)}`;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/**
 * Theme preview images (`screenshot.png`/`.webp` in the archive), checked by content and kept in
 * settings beside the theme: one row per image plus a small index of versions for listings.
 */
export class ThemeScreenshots {
  constructor(
    private readonly settings: SettingsRepository,
    /** Decodes the image (bounded), so only screenshots that render are kept. */
    private readonly images?: Pick<ImageProcessor, 'dimensions'>,
  ) {}

  /** The real type of uploaded screenshot bytes; throws unless it is a decodable PNG or WebP. */
  async check(bytes: Uint8Array): Promise<ScreenshotType> {
    const type = sniffMediaType(bytes);
    if (!TYPES.includes(type as ScreenshotType))
      throw invalidInput(Errors.ThemeScreenshotInvalid);
    if (this.images)
      await this.images.dimensions(bytes).catch(() => {
        throw invalidInput(Errors.ThemeScreenshotInvalid);
      });
    return type as ScreenshotType;
  }

  /** Version (cache key) of each theme's screenshot by theme id. */
  async versions(): Promise<Record<string, string>> {
    const stored = await this.settings.get(INDEX_KEY);
    return typeof stored === 'object' &&
      stored !== null &&
      !Array.isArray(stored)
      ? Object.fromEntries(
          Object.entries(stored).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  }

  async get(
    id: string,
  ): Promise<{ type: ScreenshotType; bytes: Uint8Array<ArrayBuffer> } | null> {
    const stored = (await this.settings.get(keyOf(id))) as {
      type?: unknown;
      data?: unknown;
    } | null;
    if (
      !stored ||
      !TYPES.includes(stored.type as ScreenshotType) ||
      typeof stored.data !== 'string'
    )
      return null;
    try {
      const bytes = fromBase64(stored.data);
      // Re-checked on read, so a damaged row is never served under the wrong type.
      return sniffMediaType(bytes) === stored.type
        ? { type: stored.type as ScreenshotType, bytes }
        : null;
    } catch {
      return null;
    }
  }

  /** Stores `bytes` as the theme's screenshot, or removes it when null. */
  async save(id: string, bytes: Uint8Array | null): Promise<void> {
    const versions = await this.versions();
    if (bytes) {
      const type = await this.check(bytes);
      await this.settings.set(keyOf(id), { type, data: toBase64(bytes) });
      versions[id] = fingerprint(bytes);
    } else {
      if (!versions[id]) return;
      await this.settings.set(keyOf(id), null);
      delete versions[id];
    }
    await this.settings.set(INDEX_KEY, versions);
  }
}
