import { expect, test } from 'bun:test';
import { monthGrid, weekdayOrder } from '#lib/theme/calendar.js';

test('the calendar starts weeks on the configured day', () => {
  // March 2026 begins on a Sunday.
  expect(monthGrid(2026, 3, 0)[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(monthGrid(2026, 3, 1)[0]).toEqual([
    null,
    null,
    null,
    null,
    null,
    null,
    1,
  ]);
  expect(monthGrid(2026, 3, 6)[0]).toEqual([null, 1, 2, 3, 4, 5, 6]);
  expect(monthGrid(2026, 3, 1).flat().filter(Boolean)).toHaveLength(31);
  expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
});
