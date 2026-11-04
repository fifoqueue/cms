/** Only request-independent public DTOs belong here. Invalidation drops in-flight fills too. */
export interface PublicCache {
  get<T>(key: string, load: () => Promise<T>, ttlMs?: number): Promise<T>;
  invalidate(): void;
}
