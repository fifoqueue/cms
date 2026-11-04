import { permalinkPathSchema } from '@cms/sdk';

/**
 * Whether an API-supplied permalink is safe as a same-site redirect target: a single
 * root-relative, already normalized pathname (no scheme, host, backslash, query or controls).
 */
export const isInternalPath = (path: string) =>
  permalinkPathSchema.safeParse(path).success;

/** Registered redirects allow root-relative URLs and credential-free absolute HTTPS URLs. */
export const isRedirectTarget = (target: string, base: URL) => {
  if (
    /[\s\\]/.test(target) ||
    [...target].some((char) => char.charCodeAt(0) < 32)
  )
    return false;

  try {
    const url = new URL(target, base);

    if (url.username || url.password) return false;

    return (
      (target.startsWith('/') &&
        !target.startsWith('//') &&
        url.origin === base.origin) ||
      (target.startsWith('https://') && url.protocol === 'https:')
    );
  } catch {
    return false;
  }
};
