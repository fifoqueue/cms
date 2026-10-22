import { MEDIA_PATH } from '@cms/sdk/media-paths';

/**
 * An image source the renderer may emit: uploaded media (`/media/...`) or an `https:` URL.
 * Anything else (other schemes, protocol-relative or traversing paths) is dropped.
 */
export const safeImageSrc = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (value.startsWith(MEDIA_PATH))
    return /^\/media\/[\w./-]+$/.test(value) && !value.includes('..')
      ? value
      : null;
  return safeHttpsUrl(value);
};

/** `value` as a normalized `https:` URL, or null. */
export const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
