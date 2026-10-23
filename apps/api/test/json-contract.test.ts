import { describe, expect, test } from 'bun:test';
import { isJsonValue, stringifyJson } from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import { definePlugin } from '@cms/sdk/plugin';
import { ContentService } from '#api/domain/content/content-service';
import {
  PublicContentService,
  PublishedContentReader,
} from '#api/domain/content/public-content';
import type { Database } from '#api/infra/prisma/client';
import { PrismaPluginDataRepository } from '#api/infra/prisma/plugin-repositories';
import { tiptapRenderer } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { PluginDataRepository } from '#api/plugin-runtime/ports';
import {
  ADMIN,
  testFields,
  testTypes,
  plainHasher,
  testLocks,
  MemoryContentRepository,
  MemoryPluginData,
  fixedClock,
  noUsers,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { MemoryRevisionRepository } from '#test/support/memory-revisions';
import { Embeds, vimeo, youtube } from '#api/domain/content/embeds';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { createRuntime } from '#test/support/runtime';

/** Values past the engine's nesting limit take seconds to build and check on a loaded machine. */
const DEEP_TIMEOUT_MS = 30_000;

const cyclic = () => {
  const value: Record<string, unknown> = { a: 1 };
  value.self = value;

  return value;
};

/** The reviewed bypass: a non-enumerable `toJSON` that `Object.values` does not see. */
const hiddenToJson = () =>
  Object.defineProperty({}, 'toJSON', {
    value() {
      throw Error('serialization failed');
    },
  });

const unsupported: [string, () => unknown][] = [
  ['undefined', () => undefined],
  ['nested undefined', () => ({ a: undefined })],
  ['function', () => ({ a: () => 1 })],
  ['symbol', () => [Symbol('s')]],
  ['bigint', () => 1n],
  ['NaN', () => NaN],
  ['nested NaN', () => ({ a: [1, NaN] })],
  ['Infinity', () => ({ a: -Infinity })],
  ['Date', () => ({ a: new Date(0) })],
  ['Map', () => new Map()],
  ['class instance', () => new (class Point {})()],
  ['sparse array', () => new Array<number>(3)],
  ['named array key', () => Object.assign([1], { extra: 2 })],
  ['symbol key', () => ({ [Symbol('s')]: 1 })],
  ['cycle', cyclic],
  ['array cycle', () => [cyclic()]],
  [
    'getter',
    () => ({
      get a() {
        return 1;
      },
    }),
  ],
  [
    'throwing getter',
    () => ({
      get a() {
        throw new Error('boom');
      },
    }),
  ],
  ['hidden toJSON', () => hiddenToJson()],
  ['hidden property', () => Object.defineProperty({}, 'a', { value: 1 })],
];

const nest = (depth: number) => {
  let value: unknown = 1;

  for (let i = 0; i < depth; i++) value = [value];

  return value;
};

/** Independent oracle: what the runtime itself can serialize. */
const serializes = (value: unknown) => {
  try {
    JSON.stringify(value);

    return true;
  } catch {
    return false;
  }
};

describe('isJsonValue', () => {
  test('accepts JSON data, including shared (acyclic) references', () => {
    const shared = { x: 1 };

    for (const value of [
      null,
      true,
      0,
      -1.5,
      '',
      [],
      { a: [1, 'b', null, { c: false }] },
      { left: shared, right: shared },
      Object.create(null) as object,
    ])
      expect(isJsonValue(value)).toBe(true);
  });

  test.each(unsupported)('rejects %s', (_, make) => {
    expect(isJsonValue(make())).toBe(false);
    expect(() => stringifyJson(make())).toThrow(TypeError);
  });

  test('rejects the reviewed hidden toJSON that breaks Response.json', () => {
    expect(() => Response.json({ meta: hiddenToJson() })).toThrow(
      'serialization failed',
    );
    expect(isJsonValue(hiddenToJson())).toBe(false);
    expect(isJsonValue({ meta: hiddenToJson() })).toBe(false);
  });

  test(
    'agrees with JSON.stringify on nesting depth, without overflowing',
    () => {
      // One value past the engine's nesting limit (the oracle confirms it); serializing it costs ~0.5s.
      const tooDeep = nest(100_000);
      const deep = nest(1_000);

      expect(serializes(tooDeep)).toBe(false);
      expect(isJsonValue(tooDeep)).toBe(false);
      expect(serializes(deep)).toBe(true);
      expect(isJsonValue(deep)).toBe(true);
      // The depth must pass the engine's own limit, so it cannot shrink; a busy machine needs time.
    },
    DEEP_TIMEOUT_MS,
  );

  test('rejects deep cycles from the shape check alone', () => {
    const loop: unknown[] = [];
    let tail = loop;

    for (let i = 0; i < 100_000; i++) tail = (tail[0] = []) as unknown[];
    tail.push(loop);

    expect(isJsonValue(loop)).toBe(false);
  });
});

describe('content.public filter output', () => {
  const setup = async () => {
    const repository = new MemoryContentRepository();
    const { logger, lines } = recordingLogger();
    const hooks = new HookBus({ timeoutMs: 50, logger });

    const service = new ContentService({
      repository,
      renderer: tiptapRenderer,
      hooks,
      ids: sequentialIds(),
      clock: fixedClock(),
      users: noUsers,
      revisions: new MemoryRevisionRepository(),
      hasher: plainHasher,
      types: testTypes(),
      fields: testFields(),
    });
    await service.create(
      {
        type: 'post',
        title: 'Hello',
        status: 'published',
        document: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
          ],
        },
      },
      ADMIN,
    );

    const published = new MemoryPublishedContentRepository(repository);
    const publicContent = new PublicContentService(
      new PublishedContentReader(published),
      hooks,
      testLocks(published),
      new Embeds(() => [youtube, vimeo]),
      testFields(),
      testTypes(),
    );

    return { hooks: hooks.registrar('p'), publicContent, lines };
  };

  test('invalid results are discarded, keeping the previous valid content serializable', async () => {
    const { hooks, publicContent, lines } = await setup();
    // Same handlers for full content and list items.
    const filter = (
      handler: (value: PublicContent) => unknown,
      priority = 10,
    ) => {
      hooks.filter('content.public', handler as never, priority);
      hooks.filter('content.publicSummary', handler as never, priority);
    };

    filter((value) => ({
      ...value,
      meta: { ...value.meta, kept: 1 },
    }));
    const bad: ((value: PublicContent) => unknown)[] = [
      ...unsupported.map(([, make]) => (value: PublicContent) => ({
        ...value,
        meta: { broken: make() },
      })),
      (value) => ({ ...value, meta: cyclic() }),
      (value) => ({ ...value, extra: cyclic() }),
      (value) => ({ ...value, extra: 'leak' }),
      (value) => ({ ...value, toJSON: () => cyclic() }),
      (value) =>
        Object.assign(
          new (class Hostile {
            toJSON() {
              throw new Error('boom');
            }
          })(),
          value,
        ),
    ];

    for (const handler of bad) filter(handler, 20);

    filter((value) => ({ ...value, title: `${value.title}!` }), 30);

    const item = await publicContent.getBySlug('hello');
    expect(item.title).toBe('Hello!');
    expect(item.meta).toEqual({ kept: 1 });
    expect(Object.keys(item)).not.toContain('extra');
    expect(await Response.json(item).json()).toEqual(item);

    const page = await publicContent.list({});
    // `toEqual` treats the undefined `html` as absent.
    expect(page.items as unknown[]).toEqual([
      { ...item, html: undefined, fields: undefined },
    ]);
    expect(() => Response.json(page)).not.toThrow();
    expect(
      lines.filter((line) => line.includes('invalid value')).length,
    ).toBeGreaterThanOrEqual(bad.length);
  });

  test(
    'meta nested too deep to serialize is discarded for every endpoint',
    async () => {
      const { hooks, publicContent } = await setup();
      const meta = { deep: nest(100_000) };

      hooks.filter('content.public', (value) => ({ ...value, meta }));
      hooks.filter('content.publicSummary', (value) => ({ ...value, meta }));

      const item = await publicContent.getBySlug('hello');
      const page = await publicContent.list({});

      expect(item.meta).toEqual({});
      expect(page.items as unknown[]).toEqual([
        { ...item, html: undefined, fields: undefined },
      ]);
      expect(() => Response.json(page)).not.toThrow();
    },
    DEEP_TIMEOUT_MS,
  );

  test('an accepted result is a core copy the plugin cannot break afterwards', async () => {
    const { hooks, publicContent } = await setup();
    const returned: Record<string, unknown>[] = [];

    hooks.filter('content.public', (value) => {
      const meta: Record<string, unknown> = { n: 1 };

      returned.push(meta);

      return { ...value, meta };
    });

    const item = await publicContent.getBySlug('hello');

    for (const meta of returned) meta.late = cyclic();

    expect(item.meta).toEqual({ n: 1 });
    expect(() => Response.json(item)).not.toThrow();
  });
});

describe('plugin settings.get', () => {
  test('returns only declared values, never inherited object members', async () => {
    const runtime = createRuntime();
    const seen: [string, unknown][] = [];

    await runtime.host.install(
      runtime.bundles.register(
        's',
        definePlugin({
          manifest: {
            id: 'settings-reader',
            name: 'Settings reader',
            version: '1.0.0',
            settings: [
              { key: 'label', label: 'Label', type: 'text', default: 'Hi' },
              { key: 'constructor', label: 'C', type: 'number' },
            ],
          },
          async activate({ settings }) {
            for (const key of [
              'label',
              'constructor',
              'toString',
              'hasOwnProperty',
              '__proto__',
              'undeclared',
            ])
              seen.push([key, await settings.get(key)]);
          },
        }),
      ),
    );

    await runtime.host.enable('settings-reader');

    expect(seen).toEqual([
      ['label', 'Hi'],
      ['constructor', undefined],
      ['toString', undefined],
      ['hasOwnProperty', undefined],
      ['__proto__', undefined],
      ['undeclared', undefined],
    ]);
  });
});

/** Minimal stand-in for the Prisma `pluginData` delegate: rows hold JSON text, like the DB. */
const fakeDatabase = () => {
  interface Row {
    pluginId: string;
    scope: string;
    key: string;
    value: string;
  }
  type Where = Omit<Row, 'value'>;

  const rows = new Map<string, Row>();
  const id = ({ pluginId, scope, key }: Where) => `${pluginId}/${scope}/${key}`;

  return {
    pluginData: {
      findUnique: async ({ where }: { where: { pluginId_scope_key: Where } }) =>
        rows.get(id(where.pluginId_scope_key)) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { pluginId_scope_key: Where };
        create: Row;
        update: { value: string };
      }) => {
        const key = id(where.pluginId_scope_key);
        const row = rows.get(key);

        rows.set(key, row ? { ...row, ...update } : create);
      },
      deleteMany: async ({ where }: { where: Where }) =>
        void rows.delete(id(where)),
      findMany: async ({ where }: { where: Omit<Where, 'key'> }) =>
        [...rows.values()].filter(
          (row) => row.pluginId === where.pluginId && row.scope === where.scope,
        ),
    },
  } as unknown as Database;
};

const adapters: [string, () => PluginDataRepository][] = [
  ['memory', () => new MemoryPluginData()],
  ['prisma', () => new PrismaPluginDataRepository(fakeDatabase())],
];

describe.each(adapters)('%s plugin data', (_, make) => {
  test.each(unsupported)(
    'rejects %s and keeps the stored value',
    async (_, value) => {
      const data = make();
      await data.set('p', 'kv', 'k', { ok: true });

      await expect(data.set('p', 'kv', 'k', value())).rejects.toThrow(
        TypeError,
      );
      expect(await data.get('p', 'kv', 'k')).toEqual({ ok: true });
    },
  );

  test('stores a JSON round-trip copy', async () => {
    const data = make();
    const value = { n: -0, list: [1, 'x', null, { deep: [true] }] };
    const expected: unknown = JSON.parse(JSON.stringify(value));

    await data.set('p', 'kv', 'k', value);
    value.list.push('mutated');

    expect(await data.get('p', 'kv', 'k')).toStrictEqual(expected);
    expect(await data.entries('p', 'kv')).toStrictEqual({ k: expected });
  });
});

describe('plugin storage boundary', () => {
  test('a plugin storing NaN gets an error and the previous value survives', async () => {
    const runtime = createRuntime();
    const outcome: unknown[] = [];

    await runtime.host.install(
      runtime.bundles.register(
        'kv',
        definePlugin({
          manifest: { id: 'kv-writer', name: 'KV writer', version: '1.0.0' },
          async activate({ storage }) {
            await storage.set('count', 1);

            outcome.push(
              await storage
                .set('count', NaN)
                .catch((error: Error) => error.name),
              await storage.get('count'),
            );
          },
        }),
      ),
    );

    expect(await runtime.host.enable('kv-writer')).toMatchObject({
      status: 'active',
    });
    expect(outcome).toEqual(['TypeError', 1]);
  });
});
