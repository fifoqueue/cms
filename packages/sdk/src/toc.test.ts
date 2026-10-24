import { expect, test } from 'bun:test';
import { tocAttrsSchema } from '#sdk/toc';

test('TOC attributes allow omitted defaults, localized titles and empty levels', () => {
  expect(tocAttrsSchema.safeParse({}).success).toBe(true);
  expect(
    tocAttrsSchema.safeParse({
      title: '목차',
      levels: [],
      minHeadings: 0,
      excluded: ['한글-2'],
      collapsible: false,
      open: true,
    }).success,
  ).toBe(true);
});

test('TOC attributes reject invalid levels, thresholds, flags and unknown attributes', () => {
  for (const attrs of [
    { levels: [1] },
    { levels: [2, 2] },
    { levels: [5] },
    { minHeadings: -1 },
    { minHeadings: 1.5 },
    { minHeadings: '2' },
    { excluded: [1] },
    { collapsible: 'true' },
    { open: null },
    { title: 'x'.repeat(201) },
    { unexpected: true },
    { minHeadings: 101 },
    { excluded: ['x'.repeat(201)] },
    { excluded: Array(101).fill('a') },
  ])
    expect(tocAttrsSchema.safeParse(attrs).success).toBe(false);
});
