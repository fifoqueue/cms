import { z } from 'zod';

export const responseHeadersSchema = z
  .record(
    z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/),
    z
      .string()
      .max(4096)
      .refine((value) =>
        [...value].every((character) => {
          const code = character.charCodeAt(0);

          return code >= 32 && code !== 127 && code <= 255;
        }),
      ),
  )
  .refine((headers) => Object.keys(headers).length <= 64);

const locked = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'frame-ancestors',
  'strict-transport-security',
  'set-cookie',
  'set-cookie2',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'content-type',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'trailer',
  'location',
  'refresh',
  'clear-site-data',
  'www-authenticate',
]);

/** Existing values are immutable; security and transport policy stay core-owned. */
export const acceptsResponseHeaders = (
  candidate: unknown,
  previous: Record<string, string>,
  privateResponse = false,
): boolean => {
  const parsed = responseHeadersSchema.safeParse(candidate);

  if (!parsed.success) return false;
  const before = new Map(
    Object.entries(previous).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const after = new Map<string, string>();

  for (const [key, value] of Object.entries(parsed.data)) {
    const name = key.toLowerCase();

    if (after.has(name)) return false;
    after.set(name, value);

    if (before.has(name)) {
      if (before.get(name) !== value) return false;
    } else if (
      locked.has(name) ||
      name.startsWith('access-control-') ||
      (privateResponse &&
        ['cache-control', 'expires', 'pragma', 'vary'].includes(name))
    )
      return false;
  }

  return [...before].every(([key, value]) => after.get(key) === value);
};
