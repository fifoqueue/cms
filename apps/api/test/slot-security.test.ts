import { expect, test } from 'bun:test';
import { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import type { SlotContext } from '@cms/sdk/plugin';

test('slot output preserves safe text without executable elements or attributes', async () => {
  const registry = new SlotRegistry({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });

  registry
    .registrar('test')
    .provide(
      'body.open',
      () =>
        '<p onclick="alert(1)">Safe text</p><script>alert(2)</script><img src="javascript:alert(3)" onerror="alert(4)"><svg onload="alert(5)"></svg>',
    );
  const slots = await registry.render({
    path: '/',
    site: {},
    content: null,
  } as SlotContext);
  const html = slots['body.open'].join('');

  expect(html).toContain('Safe text');
  expect(html).not.toMatch(/<script|<svg|onerror|onclick|onload|javascript:/i);
});
