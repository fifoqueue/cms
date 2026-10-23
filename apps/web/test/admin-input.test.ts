import { expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { eachBounded, readSelection } from '#lib/server/bulk.js';
import { readScreenOptions } from '#lib/server/screen-options.js';
import { loadPluginBlocks } from '#lib/admin/editor/plugin-blocks.js';

const form = (ids: string[]) => {
  const data = new FormData();
  for (const id of ids) data.append('ids', id);
  return data;
};

test('plugin block choices refresh after activation between editor visits', async () => {
  const original = globalThis.fetch;
  let blocks: unknown[] = [];
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json(blocks);
  }) as typeof fetch;
  try {
    expect(await Promise.all([loadPluginBlocks(), loadPluginBlocks()])).toEqual(
      [[], []],
    );
    expect(calls).toBe(1);
    blocks = [
      {
        block: 'plugin:sample:notice',
        title: 'Notice',
        description: '',
        attributes: [],
      },
    ];
    expect(await loadPluginBlocks()).toEqual(blocks);
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = original;
  }
});

test('bulk selections are capped up front and invalid ids are reported, never dropped', async () => {
  const over = readSelection(
    form(Array.from({ length: 101 }, (_, index) => `id-${index}`)),
  );
  expect(over.failure?.status).toBe(400);

  const plugin = 'long-valid-plugin-identifier-with-more-than-36-chars';
  const selection = readSelection(form([plugin, plugin, 'Bad Id']), (id) =>
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
  );
  expect(selection.ids).toEqual([plugin]);
  const result = await eachBounded(
    selection.ids!,
    async () => {},
    selection.invalid,
  );
  expect(result.done).toBe(1);
  expect(result.failed.map((failure) => failure.id)).toEqual(['Bad Id']);
});

test('Screen Options cookies of any JSON shape fall back to the defaults', () => {
  const cookies = (value: string) =>
    ({ get: () => value }) as unknown as Cookies;
  for (const value of [
    '{"perPage":{"toString":null}}',
    '{"perPage":"50"}',
    '[1,2]',
    'null',
    'not json',
  ])
    expect(
      readScreenOptions(cookies(value), 'content', ['author'], 20),
    ).toEqual({ perPage: 20, hidden: [] });
  expect(
    readScreenOptions(
      cookies('{"perPage":50,"hidden":["author","x"]}'),
      'content',
      ['author'],
      20,
    ),
  ).toEqual({ perPage: 50, hidden: ['author'] });
});
