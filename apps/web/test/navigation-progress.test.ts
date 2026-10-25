import { expect, test } from 'bun:test';
import {
  PROGRESS_LIMIT,
  PROGRESS_START,
  advanceProgress,
} from '#lib/navigation-progress.js';

test('the loading bar creeps forward, slows down and never passes its limit', () => {
  let value = PROGRESS_START;
  let previousStep = Infinity;
  for (let i = 0; i < 200; i++) {
    const next = advanceProgress(value);
    expect(next).toBeGreaterThanOrEqual(value);
    expect(next - value).toBeLessThanOrEqual(previousStep);
    previousStep = next - value;
    value = next;
  }
  expect(value).toBeLessThanOrEqual(PROGRESS_LIMIT);
  expect(value).toBeGreaterThan(0.85);
  expect(advanceProgress(PROGRESS_LIMIT)).toBe(PROGRESS_LIMIT);
});
