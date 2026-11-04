import { expect, test } from 'bun:test';
import { RuntimeShortcodes } from '#api/domain/content/shortcodes';
import { definePlugin } from '@cms/sdk/plugin';
import { createRuntime } from '#test/support/runtime';

test('shortcode registrations follow plugin activation and scope release', async () => {
  const runtime = createRuntime();
  const bundle = runtime.bundles.register(
    'shortcodes',
    definePlugin({
      manifest: { id: 'shortcodes', name: 'Shortcodes', version: '1.0.0' },
      activate({ shortcodes }) {
        shortcodes.register('notice', {
          render: () => '<strong>Notice</strong>',
        });
      },
    }),
  );

  await runtime.host.install(bundle);
  await runtime.host.enable('shortcodes');
  expect(await runtime.shortcodes.expand('<p>[notice]</p>')).toContain(
    '<strong>Notice</strong>',
  );
  await runtime.host.disable('shortcodes');
  expect(await runtime.shortcodes.expand('<p>[notice]</p>')).toBe(
    '<p>[notice]</p>',
  );
});

test('runtime shortcodes render safe paragraph text once and release registrations', async () => {
  const shortcodes = new RuntimeShortcodes(100);
  let calls = 0;
  const release = shortcodes.register('card', {
    render(attrs, inner, context) {
      calls++;
      expect(attrs.title).toBe('hello');
      expect(context.content?.id).toBe('entry');

      return `<strong>${inner}</strong><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">`;
    },
  });
  const code = '[card title="hello"]body[/card]';
  const html = await shortcodes.expand(
    `<p>${code} ${code} [unknown]</p><pre><code>${code}</code></pre><p><code>${code}</code></p><p title='${code}'>attribute</p>`,
    {
      content: {
        id: 'entry',
        type: 'post',
        slug: 'entry',
        path: '/entry',
        title: 'Entry',
      },
    },
  );

  expect(calls).toBe(1);
  expect(html).toContain('<strong>body</strong>');
  expect(html).toContain('[unknown]');
  expect(html).toContain(`<pre><code>${code}</code></pre>`);
  expect(html).toContain(`<p><code>${code}</code></p>`);
  expect(html).not.toMatch(/<script|javascript:|onerror/);
  release();
  expect(await shortcodes.expand(`<p>${code}</p>`)).toBe(`<p>${code}</p>`);
});

test('nested shortcodes are bounded and failed renders remain literal', async () => {
  const shortcodes = new RuntimeShortcodes(5);
  let calls = 0;

  shortcodes.register('wrap', {
    render: (_, inner) => {
      calls++;

      return `<strong>${inner}</strong>`;
    },
  });
  shortcodes.register('fail', {
    render: () => Promise.reject(new Error('failed')),
  });
  shortcodes.register('slow', { render: () => new Promise(() => {}) });
  const nested = '[wrap]'.repeat(12) + 'body' + '[/wrap]'.repeat(12);
  const html = await shortcodes.expand(`<p>${nested} [fail] [slow]</p>`);

  expect(calls).toBe(8);
  expect(html).toContain('[wrap]');
  expect(html).toContain('[fail]');
  expect(html).toContain('[slow]');
});
