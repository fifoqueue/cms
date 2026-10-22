import type { Clock, RateLimiter } from '#api/domain/ports';

export interface MemoryRateLimiterOptions {
  clock: Clock;
  /** Attempts per window for one key. */
  perKey: number;
  /** Attempts per window across all keys. */
  total: number;
  windowMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Token buckets in process memory, one per key plus one overall. Each holds up to its limit and
 * refills at limit/window, so bursts up to the limit are allowed and the long-run rate is the limit
 * per window. Per process: with several API instances each enforces its own limits.
 *
 * Memory stays bounded whatever keys callers invent: a key is only tracked after an admitted
 * attempt (which also spends an overall token) and is forgotten one window after its last
 * admission, when its bucket is full again. At most `2 × total` keys are tracked at once, the most
 * the overall bucket can admit within one window.
 */
export class MemoryRateLimiter implements RateLimiter {
  /** Ordered by last admission, oldest first. */
  private readonly keys = new Map<string, Bucket>();
  private readonly overall: Bucket;

  constructor(private readonly options: MemoryRateLimiterOptions) {
    this.overall = {
      tokens: options.total,
      updatedAt: options.clock.now().getTime(),
    };
  }

  /** Number of keys currently remembered. */
  get trackedKeys() {
    return this.keys.size;
  }

  tryAcquire(key: string): boolean {
    const now = this.options.clock.now().getTime();
    this.forgetIdle(now);

    const overall = this.refill(this.overall, this.options.total, now);
    if (overall < 1) return false;

    const bucket = this.keys.get(key);
    const tokens = bucket
      ? this.refill(bucket, this.options.perKey, now)
      : this.options.perKey;
    if (tokens < 1) return false;

    this.overall.tokens = overall - 1;
    this.overall.updatedAt = now;
    this.keys.delete(key);
    this.keys.set(key, { tokens: tokens - 1, updatedAt: now });

    return true;
  }

  private refill(bucket: Bucket, limit: number, now: number) {
    const elapsed = Math.max(0, now - bucket.updatedAt);

    return Math.min(
      limit,
      bucket.tokens + (elapsed * limit) / this.options.windowMs,
    );
  }

  /** Drops keys idle for a full window: their buckets are full, the same as unknown keys. */
  private forgetIdle(now: number) {
    for (const [key, bucket] of this.keys) {
      if (now - bucket.updatedAt < this.options.windowMs) return;
      this.keys.delete(key);
    }
  }
}
