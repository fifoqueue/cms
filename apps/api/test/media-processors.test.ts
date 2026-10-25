import { expect, test } from 'bun:test';
import { MediaProcessors } from '#api/domain/media/media-processors';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';

test('processors isolate failures, revoke with scope and fall back after decode failure', async () => {
  const registry = new MediaProcessors(10);
  registry.registerCore({
    process: ({ bytes }) => {
      if (bytes[0] === 9) throw new Error('decode');
      return new Uint8Array([bytes[0]!, 2]);
    },
  });
  registry.register({
    process: () => {
      throw new Error('offline');
    },
  });
  registry.register({ process: async () => new Promise(() => {}) });
  const scope = new PluginScope();
  scope.track(() => registry.register({ process: () => new Uint8Array([3]) }));
  expect(await registry.process(new Uint8Array([1]), 'image/png')).toEqual(
    new Uint8Array([3, 2]),
  );
  scope.dispose();
  expect(await registry.process(new Uint8Array([1]), 'image/png')).toEqual(
    new Uint8Array([1, 2]),
  );
  registry.register({ process: () => new Uint8Array([9]) });
  expect(await registry.process(new Uint8Array([1]), 'image/png')).toEqual(
    new Uint8Array([1, 2]),
  );
});

test('core processor failures propagate instead of storing unprocessed bytes', async () => {
  const registry = new MediaProcessors(10);
  await expect(
    registry.process(new Uint8Array([1]), 'image/png'),
  ).rejects.toThrow();
  registry.registerCore({
    process: () => {
      throw new Error('core offline');
    },
  });
  registry.register({ process: () => new Uint8Array([3]) });
  await expect(
    registry.process(new Uint8Array([1]), 'image/png'),
  ).rejects.toThrow('core offline');
});
