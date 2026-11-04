import { z } from 'zod';
import type { Awaitable } from '#sdk/common';

export const redirectSchema = z.object({
  to: z.string().min(1).max(2048),
  status: z.union([
    z.literal(301),
    z.literal(302),
    z.literal(307),
    z.literal(308),
  ]),
});

export type PageRedirect = z.infer<typeof redirectSchema>;

export interface RedirectRegistrar {
  register(
    key: string,
    definition: {
      resolve(path: string): Awaitable<PageRedirect | null>;
    },
  ): () => void;
}

export const safeRedirect = (
  to: string,
  origins: readonly string[] = [],
): boolean => {
  if (
    [...to].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) ||
    /[\\<>"']|%(?:0[0-9a-f]|1[0-9a-f]|7f|5c|25)/i.test(to)
  )
    return false;

  try {
    const url = new URL(to, 'https://cms.invalid');

    if (url.username || url.password) return false;
    if (to.startsWith('/'))
      return (
        !to.startsWith('//') &&
        !/^\/%2f/i.test(to) &&
        url.origin === 'https://cms.invalid'
      );

    return (
      to.startsWith('https://') &&
      url.protocol === 'https:' &&
      origins.includes(url.origin)
    );
  } catch {
    return false;
  }
};
