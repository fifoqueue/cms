import { expect, test } from 'bun:test';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
import { resolvePathChanges } from '#api/domain/permalinks/path-plan';

const values = {
  id: 'entry',
  slug: 'hello',
  title: 'Hello',
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

test('tokens validate segments, isolate failures and retain core fallbacks', async () => {
  const tokens = new PermalinkTokenRegistry(5);
  const remove = tokens.register('region', () => '서울');
  expect(await tokens.expand('/%region%/%slug%', values)).toBe(
    `/${encodeURIComponent('서울')}/hello`,
  );
  remove();
  expect(await tokens.resolve('region', values)).toBe('');
  tokens.register('slug', () => '../escape');
  expect(await tokens.resolve('slug', values)).toBe('hello');
  tokens.register('slug', () => '');
  expect(await tokens.resolve('slug', values)).toBe('hello');
  tokens.register('region', () => new Promise(() => {}));
  expect(await tokens.resolve('region', values)).toBe('');
  tokens.register('region', () => {
    throw new Error('broken');
  });
  expect(await tokens.resolve('region', values)).toBe('');
});

test('path plans use token expansions and missing custom segments fall back safely', async () => {
  const tokens = new PermalinkTokenRegistry(5);
  const remove = tokens.register('region', () => 'north');
  const entries = [
    {
      subject: {
        ...values,
        type: 'post',
        createdAt: new Date(values.createdAt),
      },
      current: null,
      retainPrevious: false,
    },
  ];
  const settings = { post: '/%region%/%slug%' };
  expect(
    (await resolvePathChanges(settings, entries, 'UTC', tokens))[0]?.to,
  ).toBe('/north/hello');
  remove();
  expect(
    (await resolvePathChanges(settings, entries, 'UTC', tokens))[0]?.to,
  ).toBe('/hello');
});
