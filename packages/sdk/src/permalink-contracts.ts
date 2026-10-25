import { z } from 'zod';
import type { PermalinkValues } from '#sdk/permalinks';
import type { Awaitable } from '#sdk/common';
import type { Unsubscribe } from '#sdk/plugin';

/** Decoded segment. Percent signs are refused to prevent double-encoding ambiguity. */
export const permalinkSegmentSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      value !== '.' &&
      value !== '..' &&
      !/[\\/?#%\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
  );

export type PermalinkTokenResolver = (
  values: Readonly<PermalinkValues>,
) => Awaitable<string>;

export interface PermalinkTokenRegistrar {
  register(key: string, resolver: PermalinkTokenResolver): Unsubscribe;
}
