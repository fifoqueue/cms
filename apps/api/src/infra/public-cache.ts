import type { PublicCache } from '#api/domain/site/public-cache';

/** Process-local, bounded-lifetime snapshots; failures are never cached. */
export class MemoryPublicCache implements PublicCache {
  private generation = 0;
  private readonly entries = new Map<
    string,
    { expires: number | null; value: Promise<unknown> }
  >();

  constructor(
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(
    key: string,
    load: () => Promise<T>,
    ttlMs = this.ttlMs,
  ): Promise<T> {
    const generation = this.generation;
    let entry = this.entries.get(key);

    if (!entry || (entry.expires !== null && entry.expires <= this.now())) {
      entry = { expires: null, value: load() };

      if (generation === this.generation) this.entries.set(key, entry);
    }

    try {
      const value = await entry.value;

      if (entry.expires === null) entry.expires = this.now() + ttlMs;

      if (generation !== this.generation) return this.get(key, load, ttlMs);

      return structuredClone(value) as T;
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);

      throw error;
    }
  }

  invalidate(): void {
    this.generation++;
    this.entries.clear();
  }
}
