import { expect, test } from 'bun:test';
import { patternAllowed } from '#lib/admin/editor/allowed-pattern';

test('pattern choices require every nested core and plugin block to be allowed', () => {
  const content = [
    {
      type: 'columns',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] },
        { type: 'pluginBlock', attrs: { block: 'plugin:example:card' } },
      ],
    },
  ];

  expect(patternAllowed(content, ['columns', 'paragraph'])).toBe(false);
  expect(
    patternAllowed(content, ['columns', 'paragraph', 'plugin:example:card']),
  ).toBe(true);
  expect(patternAllowed(undefined, [])).toBe(false);
  expect(patternAllowed(content, null)).toBe(true);
});
