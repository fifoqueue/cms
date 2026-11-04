import { expect, test } from 'bun:test';
import { Translations } from '#api/domain/i18n/translations';

test('translations validate catalogs and release only their own overrides', () => {
  let invalidations = 0;
  const translations = new Translations(() => invalidations++);
  const first = translations.register('en', {
    site: { commentCount: '{count} comments' },
  });
  const second = translations.register('en', {
    site: { commentCount: 'Comments: {count}' },
  });

  expect(translations.messages('en', 'site').commentCount).toBe(
    'Comments: {count}',
  );
  expect(translations.messages('ko', 'site')).toEqual({});
  expect(translations.messages('en', 'admin')).toEqual({});

  const invalid: Record<string, string>[] = [
    { invented: 'text' },
    { commentCount: 'No placeholder' },
    { commentCount: '{other}' },
    { commentCount: '<b>{count}</b>' },
    { commentCount: `${'x'.repeat(10001)}{count}` },
  ];

  for (const messages of invalid) {
    expect(() => translations.register('en', { site: messages })).toThrow();
  }

  second();
  expect(translations.messages('en', 'site').commentCount).toBe(
    '{count} comments',
  );
  first();
  first();
  expect(translations.active).toBe(false);
  expect(translations.messages('en', 'site')).toEqual({});
  expect(invalidations).toBe(4);
});
