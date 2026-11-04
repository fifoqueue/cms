import { expect, test } from 'bun:test';
import { RuntimeShortcodes } from '#api/domain/content/shortcodes';

test('shortcode budget stops subsequent rendering after oversized output', async () => {
  const registry = new RuntimeShortcodes();
  let calls = 0;

  registry.register('large', {
    render: () => {
      calls++;

      return 'x'.repeat(800_000);
    },
  });
  const html = await registry.expand(
    '<p>' +
      Array.from({ length: 9 }, (_, id) => `[large id="${id}"]`).join('') +
      '</p>',
  );

  expect(calls).toBe(3);
  expect(html).toContain('[large id="8"]');
});

test('nested shortcode tags match exactly', async () => {
  const registry = new RuntimeShortcodes();

  registry.register('foo', {
    render: (_, inner) => `<strong>${inner}</strong>`,
  });
  expect(await registry.expand('<p>[foo]A[foo-bar]B[/foo]</p>')).toBe(
    '<p><strong>A[foo-bar]B</strong></p>',
  );
});

test('inline and block shortcode fragments preserve valid paragraph nesting', async () => {
  const registry = new RuntimeShortcodes();

  registry.register('inline', { render: () => '<strong>inline</strong>' });
  registry.register('block', { render: () => '<h2>block</h2>' });
  expect(await registry.expand('<p>before [inline] after</p>')).toBe(
    '<p>before <strong>inline</strong> after</p>',
  );
  expect(await registry.expand('<p>before [block] after</p>')).toMatch(
    /^<p>before <\/p><h2(?: [^>]*)?>block<\/h2><p> after<\/p>$/,
  );
});

test('shortcodes expand headings lists and quotes but not literal regions', async () => {
  const registry = new RuntimeShortcodes();

  registry.register('x', { render: () => '<strong>X</strong>' });
  expect(
    await registry.expand(
      '<h2>[x]</h2><ul><li>[x]</li></ul><blockquote>[x]</blockquote><pre>[x]</pre><code>[x]</code><div title="[x]"></div>',
    ),
  ).toBe(
    '<h2><strong>X</strong></h2><ul><li><strong>X</strong></li></ul><blockquote><strong>X</strong></blockquote><pre>[x]</pre><code>[x]</code><div title="[x]"></div>',
  );
});

test('replacement registration never reuses earlier cached output', async () => {
  const registry = new RuntimeShortcodes();
  const release = registry.register('value', {
    render: () => '<strong>old</strong>',
  });

  registry.register('swap', {
    render: () => {
      release();
      registry.register('value', { render: () => '<strong>new</strong>' });

      return '';
    },
  });
  expect(await registry.expand('<p>[value][swap][value]</p>')).toBe(
    '<p><strong>old</strong><strong>new</strong></p>',
  );
});
