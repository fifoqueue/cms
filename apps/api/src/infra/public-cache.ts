import type { PublicCache } from '#api/domain/site/public-cache';

/** Process-local, bounded-lifetime snapshots; failures are never cached. */
export class MemoryPublicCache implements PublicCache {
  private generation = 0;
  private readonly entries = new Map<
    string,
    { expires: number; value: Promise<unknown> }
  >();

  constructor(private readonly ttlMs = 30_000) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= Date.now()) {
      entry = { expires: Date.now() + this.ttlMs, value: load() };
      if (generation === this.generation) this.entries.set(key, entry);
    }
    try {
      const value = await entry.value;
      if (generation !== this.generation) return this.get(key, load);
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
