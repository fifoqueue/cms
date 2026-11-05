import { expect, test } from 'bun:test';
import { parseBlocks } from '#sdk/blocks';
import { menusSettingsSchema } from '#sdk/menus';

const item = (fields: Record<string, unknown>) => ({
  id: 'a',
  kind: 'custom',
  url: '/a',
  ...fields,
});

test('menus and theme buttons saved before rel existed keep working, and rel holds only allowed tokens', () => {
  const settings = menusSettingsSchema.parse({
    menus: [
      {
        id: 'm',
        name: 'Main',
        items: [
          item({ newTab: true }),
          item({ id: 'b', rel: 'ugc nofollow nofollow' }),
        ],
      },
    ],
  });

  expect(
    settings.menus[0]!.items.map(({ newTab, rel }) => [newTab, rel]),
  ).toEqual([
    [true, ''],
    [false, 'nofollow ugc'],
  ]);
  expect(
    menusSettingsSchema.safeParse({
      menus: [{ id: 'm', name: 'Main', items: [item({ rel: 'noopener' })] }],
    }).success,
  ).toBe(false);

  const button = (attrs: Record<string, unknown>) =>
    parseBlocks([
      {
        name: 'buttons',
        children: [{ name: 'button', attrs: { url: '/a', ...attrs } }],
      },
    ]);
  const stored = button({ text: 'Go', newTab: true });

  expect(stored.issues).toEqual([]);
  expect(stored.blocks[0]!.children[0]!.attrs).toMatchObject({
    newTab: true,
    rel: '',
  });
  const chosen = button({ rel: 'ugc nofollow ugc' });

  expect(chosen.issues).toEqual([]);
  expect(chosen.blocks[0]!.children[0]!.attrs).toMatchObject({
    rel: 'nofollow ugc',
  });
  expect(button({ rel: 'external' }).issues).toHaveLength(1);
});
