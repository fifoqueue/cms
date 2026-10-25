import { expect, test } from 'bun:test';
import { IMAGE_SIZES } from '@cms/sdk';
import { ImageSizes } from '#api/domain/media/image-sizes';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
test('distinct sizes are capped in registration order and drops are logged', () => {
  const warnings: string[] = [];
  const registry = new ImageSizes({
    warn: (message) => {
      warnings.push(message);
    },
  });
  const removals = Array.from({ length: 40 }, (_, i) =>
    registry.register({ name: `size-${i}`, width: 10 }),
  );
  expect(registry.list()).toHaveLength(32);
  expect(registry.list().at(-1)!.name).toBe('size-28');
  expect(warnings.some((message) => message.includes('size-29'))).toBe(true);
  removals[0]!();
  expect(registry.list().at(-1)!.name).toBe('size-29');
});

test('core sizes refuse plugin overrides and revocation removes plugin sizes', () => {
  const warnings: string[] = [];
  const registry = new ImageSizes({
    warn: (message) => {
      warnings.push(message);
    },
  });
  const builtins = registry.list();
  expect(builtins.map(({ name, width }) => [name, width])).toEqual(
    Object.entries(IMAGE_SIZES),
  );
  const scope = new PluginScope();
  scope.track(() =>
    registry.register({
      name: 'thumbnail',
      width: 100,
      height: 100,
      crop: true,
    }),
  );
  scope.track(() =>
    registry.register({ name: 'banner', width: 1200, height: 400, crop: true }),
  );
  expect(registry.list().slice(0, builtins.length)).toEqual(builtins);
  expect(warnings.some((message) => message.includes('thumbnail'))).toBe(true);
  expect(registry.list()).toContainEqual({
    name: 'banner',
    width: 1200,
    height: 400,
    crop: true,
  });
  scope.dispose();
  expect(registry.list().some(({ name }) => name === 'banner')).toBe(false);
  expect(registry.list()[0]!.width).toBe(IMAGE_SIZES.thumbnail);
  expect(() => registry.register({ name: '../unsafe', width: 10 })).toThrow();
});
