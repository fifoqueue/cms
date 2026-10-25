import { expect, test } from 'bun:test';
import { erasureRows } from '#lib/admin/erasure-report.js';
import { sizeLabel } from '#lib/admin/image-sizes.js';
import { ko } from '#lib/i18n/ko.js';

test('erasure reports list core, plugin results and failed erasers', () => {
  const rows = erasureRows({
    results: {
      'gallery:uploads': { erased: 2, retained: 1, messages: ['<b>kept</b>'] },
      'core:users': { erased: 1, retained: 0, messages: [] },
    },
    failed: ['newsletter:subscribers'],
  });
  expect(rows.map(({ owner, key }) => [owner, key])).toEqual([
    [null, 'users'],
    ['gallery', 'uploads'],
    ['newsletter', 'subscribers'],
  ]);
  expect(rows[1]!.result?.messages).toEqual(['<b>kept</b>']);
  expect(rows[2]!.result).toBeNull();
});

test('registered image sizes keep their name; core sizes are translated', () => {
  expect(sizeLabel(ko, 'medium')).toBe(ko.sizeMedium);
  expect(sizeLabel(ko, 'hero-wide')).toBe('hero-wide');
  expect(sizeLabel(ko, 'constructor')).toBe('constructor');
});
