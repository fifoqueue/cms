import { permalinkPathSchema } from '@cms/sdk';

/**
 * Whether an API-supplied permalink is safe as a same-site redirect target: a single
 * root-relative, already normalized pathname (no scheme, host, backslash, query or controls).
 */
export const isInternalPath = (path: string) =>
  permalinkPathSchema.safeParse(path).success;
