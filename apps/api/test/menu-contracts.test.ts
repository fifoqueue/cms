import { expect, test } from 'bun:test';
import { MenuService } from '#api/domain/appearance/menu-service';
import { coreMenuTypes } from '#api/domain/appearance/menu-types';
import { MenuTypeRegistry } from '#api/plugin-runtime/menu-type-registry';
import { MemoryJsonSettings } from '#test/support/json-settings';
import { recordingLogger } from '#test/support/memory';

test('plugin menu object types render, validate links, never replace core types and disappear on disable', async () => {
  const { logger, lines } = recordingLogger();
  const types = new MenuTypeRegistry({ timeoutMs: 20, logger });
  for (const [key, provider] of Object.entries(coreMenuTypes))
    types.registerCore(key, provider);
  const settings = new MemoryJsonSettings();
  const menus = new MenuService({
    settings,
    itemTypes: types,
    published: { summariesByIds: async () => [] },
    terms: { list: async () => [] },
  });
  await menus.update(
    {
      menus: [
        {
          id: 'main',
          name: 'Main',
          items: [
            { id: 'home', kind: 'home' },
            { id: 'item', kind: 'plugin', provider: 'books', objectId: 'one' },
          ],
        },
      ],
    },
    { id: 'admin', role: 'administrator' },
  );
  const remove = types.register('books', 'books', ({ item }) => ({
    url: `/books/${item.objectId}`,
    title: 'Book',
  }));
  const removeInvalid = types.register('broken', 'books', () => ({
    url: 'javascript:alert(1)',
    title: 'Invalid',
  }));
  const removeOverride = types.register('broken', 'home', () => ({
    url: '/hijacked',
    title: 'Hijacked',
  }));
  expect(
    lines.some((line) => line.startsWith('warn') && line.includes('"home"')),
  ).toBe(true);
  expect((await menus.publicItems('main'))?.map((item) => item.url)).toEqual([
    '/',
    '/books/one',
  ]);
  remove();
  removeInvalid();
  removeOverride();
  expect((await menus.publicItems('main'))?.map((item) => item.url)).toEqual([
    '/',
  ]);
  expect(settings.writes).toBe(1);
});
