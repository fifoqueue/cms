import type { PublicCache } from '#api/domain/site/public-cache';

/** Wrap persistence operations, not HTTP requests. Also covers partial commits on failure. */
export const invalidatingStore = <T extends object>(
  store: T,
  writes: readonly (keyof T)[],
  cache: Pick<PublicCache, 'invalidate'>,
): T =>
  new Proxy(store, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      if (!writes.includes(key as keyof T)) return value.bind(target);
      return async (...args: unknown[]) => {
        try {
          return await value.apply(target, args);
        } finally {
          cache.invalidate();
        }
      };
    },
  });
