import { expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('appearance core hooks cannot be replaced by custom definitions', () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });

  for (const name of [
    'theme.public',
    'widgets.public',
    'theme.setup',
    'editor.allowedBlocks',
  ]) {
    expect(() =>
      hooks.define('extension', name, {
        kind: 'filter',
        validate: () => true,
      }),
    ).toThrow();
  }
});
