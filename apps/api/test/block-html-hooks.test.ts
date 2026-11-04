import { expect, test } from 'bun:test';
import { BlockRegistry } from '#api/plugin-runtime/block-registry';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

test('block output is safe without filters, with identity filters and rejected filters', async () => {
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const blocks = new BlockRegistry({ timeoutMs: 100, logger, hooks });
  const marker =
    '<div class="cms-plugin-block" data-plugin-block="plugin:sample:unsafe" data-attrs="{}"></div>';

  blocks.registrar('sample').register('unsafe', {
    title: 'Unsafe',
    render: () =>
      '<p>Safe</p><script>alert(1)</script><img src="https://example.com/a" onerror="alert(2)">',
  });
  expect(await blocks.expand(marker)).not.toMatch(/<script|onerror/);
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('block.html', (value) => {
      expect(value.html).not.toMatch(/<script|onerror/);

      return value;
    });
  expect(await blocks.expand(marker)).not.toMatch(/<script|onerror/);
  hooks.registrar('reject').filter('block.html', (value) => ({
    ...value,
    html: 42 as unknown as string,
  }));
  expect(await blocks.expand(marker)).not.toMatch(/<script|onerror/);
});

test('block HTML filters sanitize output and share request renders', async () => {
  const logger = recordingLogger().logger;
  const hooks = new HookBus({ timeoutMs: 100, logger });
  const blocks = new BlockRegistry({ timeoutMs: 100, logger, hooks });
  let calls = 0;
  const release = blocks.registrar('sample').register('card', {
    title: 'Card',
    render: () => '<p>Original</p>',
  });
  const marker =
    '<div class="cms-plugin-block" data-plugin-block="plugin:sample:card" data-attrs="{}"></div>';

  hooks
    .registrar('functions:site', { trusted: true })
    .filter('block.html', (value, context) => {
      calls++;
      expect(context.content).toBeNull();
      expect(value.name).toBe('plugin:sample:card');

      return {
        ...value,
        html: '<p>Changed</p><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">',
      };
    });
  const html = await blocks.expand(marker + marker);

  expect(html).toContain('Changed');
  expect(html).not.toMatch(/<script|javascript:|onerror/);
  expect(calls).toBe(1);
  release();
  expect(await blocks.expand(marker)).toBe('');
});
