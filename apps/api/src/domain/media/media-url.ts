import type { HookDispatcher } from '#api/domain/ports';

export interface MediaUrl {
  url: string;
  key: string;
  variant: string | null;
  driver: string;
}

const safeUrl = (value: string) => {
  if (/[\s\\\p{Cc}]/u.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

export const projectMediaUrl = (
  value: MediaUrl,
  hooks?: HookDispatcher,
): string | Promise<string> => {
  if (!hooks?.has('media.url')) return value.url;
  const original = { ...value };
  const accept = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const result = candidate as MediaUrl;
    return (
      result.key === original.key &&
      result.variant === original.variant &&
      result.driver === original.driver &&
      typeof result.url === 'string' &&
      safeUrl(result.url)
    );
  };
  return hooks
    .applyFilter('media.url', value, accept)
    .then((result) => (accept(result) ? result.url : original.url));
};
