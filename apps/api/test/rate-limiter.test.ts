import { describe, expect, test } from 'bun:test';
import { MemoryRateLimiter } from '#api/infra/memory-rate-limiter';
import { fixedClock } from '#test/support/memory';

const WINDOW = 60_000;

const setup = (perKey: number, total: number) => {
  const clock = fixedClock();
  const limiter = new MemoryRateLimiter({
    clock,
    perKey,
    total,
    windowMs: WINDOW,
  });
  const advance = (ms: number) =>
    clock.set(new Date(clock.now().getTime() + ms).toISOString());

  return { limiter, advance };
};

describe('MemoryRateLimiter', () => {
  test('limits each key and refills it over the window', () => {
    const { limiter, advance } = setup(3, 100);

    expect([1, 2, 3, 4].map(() => limiter.tryAcquire('a'))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(limiter.tryAcquire('b')).toBe(true);

    advance(WINDOW / 3);
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(false);

    advance(WINDOW);
    expect([1, 2, 3, 4].map(() => limiter.tryAcquire('a'))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  test('refused attempts reserve nothing', () => {
    const { limiter } = setup(1, 2);

    limiter.tryAcquire('a');
    for (let attempt = 0; attempt < 100; attempt++)
      expect(limiter.tryAcquire('a')).toBe(false);

    // The overall budget only lost the one admitted attempt.
    expect(limiter.tryAcquire('b')).toBe(true);
    expect(limiter.tryAcquire('c')).toBe(false);
    expect(limiter.trackedKeys).toBe(2);
  });

  test('limits all keys together', () => {
    const { limiter, advance } = setup(5, 4);

    expect(
      ['a', 'b', 'c', 'd', 'e'].map((key) => limiter.tryAcquire(key)),
    ).toEqual([true, true, true, true, false]);

    advance(WINDOW / 4);
    expect(limiter.tryAcquire('e')).toBe(true);
    expect(limiter.tryAcquire('f')).toBe(false);
  });

  test('remembers at most twice the overall limit, however many keys are tried', () => {
    const total = 50;
    const { limiter, advance } = setup(1, total);
    let peak = 0;
    let key = 0;

    // A new key on every attempt, every second, for ten windows.
    for (let second = 0; second < 600; second++) {
      for (let attempt = 0; attempt < 20; attempt++)
        limiter.tryAcquire(`attacker-${key++}`);
      peak = Math.max(peak, limiter.trackedKeys);
      advance(1_000);
    }

    expect(peak).toBeLessThanOrEqual(2 * total);

    // Idle keys are forgotten one window after their last admission.
    advance(WINDOW);
    limiter.tryAcquire('fresh');
    expect(limiter.trackedKeys).toBe(1);
  });
});
