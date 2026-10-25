import { describe, expect, test } from 'bun:test';
import type { SearchDocument } from '#api/domain/search/ports';
import { SearchService } from '#api/domain/search/search-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { Errors } from '#api/shared/errors';
import {
  fixedClock,
  MemorySettings,
  recordingLogger,
} from '#test/support/memory';
import { plainSecretBox } from '#test/support/memory-security';
import {
  MemorySearchEngine,
  MemorySearchSource,
} from '#test/support/memory-search';

const doc = (id: string, title: string): SearchDocument => ({
  id,
  type: 'post',
  title,
  excerpt: '',
  text: '',
  categories: [],
  tags: [],
  publishedAt: 0,
  sticky: false,
});

const query = (text: string) => ({ text, page: 1, pageSize: 10 });

const setup = (hooks?: HookBus) => {
  const clock = fixedClock();
  const engine = new MemorySearchEngine();
  const source = new MemorySearchSource();
  const search = new SearchService({
    hooks,
    settings: new MemorySettings(),
    secrets: plainSecretBox,
    engine,
    source,
    clock,
    logger: recordingLogger().logger,
  });
  return { clock, engine, source, search };
};

test('search validates document identity on both indexing paths', async () => {
  const hooks = new HookBus({
    timeoutMs: 20,
    logger: recordingLogger().logger,
  });
  const registrar = hooks.registrar('test');
  const { search, source, engine } = setup(hooks);
  const indexed: unknown[] = [];
  registrar.on('search.indexed', (event) => {
    expect(source.outbox).toEqual([]);
    indexed.push(event);
  });
  let documents = 0;
  registrar.filter('search.document', (value) => {
    documents++;
    return { ...value, title: 'Filtered' };
  });
  registrar.filter('search.document', (value) => ({ ...value, id: 'wrong' }));
  await search.update({ enabled: true, host: 'http://meili.test' });
  source.write(doc('a', 'Original'));
  await search.sync();
  expect(await search.find(query('Filtered'))).toEqual({
    ids: ['a'],
    total: 1,
  });
  source.write(doc('a', 'Updated'));
  await search.sync();
  expect(await search.find(query('Filtered'))).toEqual({
    ids: ['a'],
    total: 1,
  });
  expect(documents).toBe(2);
  expect(indexed).toEqual([
    { operation: 'rebuild', contentIds: null },
    { operation: 'update', contentIds: ['a'] },
  ]);
  engine.failing = true;
  source.write(doc('a', 'Failed update'));
  await search.sync();
  expect(indexed).toHaveLength(2);
});

describe('SearchService', () => {
  test('the index answers only while it holds every committed change', async () => {
    const { search, source } = setup();
    source.write(doc('a', 'Apple pie'));
    // Off: the database answers, and changes are not kept for later.
    expect(await search.find(query('apple'))).toBeNull();
    await search.sync();
    expect(source.outbox).toEqual([]);

    await search.update({ enabled: true, host: 'http://meili.test' });
    expect(await search.find(query('apple'))).toBeNull();
    await search.sync();
    expect(await search.find(query('apple'))).toEqual({ ids: ['a'], total: 1 });
    expect((await search.status()).engine).toBe('meilisearch');

    // A committed change the index has not seen yet sends searches to the database.
    source.write({ id: 'a', removed: true });
    expect(await search.find(query('apple'))).toBeNull();
    expect((await search.status()).state).toBe('syncing');
    await search.sync();
    expect(await search.find(query('apple'))).toEqual({ ids: [], total: 0 });

    // Moving to another server or index rebuilds before answering again.
    source.write(doc('b', 'Banana bread'));
    await search.sync();
    await search.update({ enabled: true, host: 'http://other.test' });
    expect(await search.find(query('banana'))).toBeNull();
    await search.sync();
    expect(await search.find(query('banana'))).toEqual({
      ids: ['b'],
      total: 1,
    });
  });

  test('a failing engine falls back to the database and recovers after a pause', async () => {
    const { search, source, engine, clock } = setup();
    await search.update({ enabled: true, host: 'http://meili.test' });
    source.write(doc('a', 'Apple'));
    await search.sync();

    engine.failing = true;
    expect(await search.find(query('apple'))).toBeNull();
    expect(await search.status()).toMatchObject({
      engine: 'database',
      state: 'failing',
      // The engine's own words stay in the server log.
      lastError: Errors.SearchSyncFailed,
    });
    engine.failing = false;
    // Still paused: searches keep using the database for a while.
    expect(await search.find(query('apple'))).toBeNull();
    clock.set('2026-01-01T00:00:31.000Z');
    source.write(doc('c', 'Apple crumble'));
    await search.sync();
    expect(await search.find(query('apple'))).toEqual({
      ids: ['a', 'c'],
      total: 2,
    });
    expect((await search.status()).lastError).toBeNull();
  });

  test('failures are stored as catalog text with safe values only', async () => {
    const { search, source, engine, clock } = setup();
    await search.update({ enabled: true, host: 'http://meili.test' });
    source.write(doc('a', 'Apple'));
    const fail = async (error: Error) => {
      engine.failing = error;
      clock.set(new Date(clock.now().getTime() + 31_000).toISOString());
      source.write(doc('a', 'Apple'));
      await search.sync();
      return search.status();
    };
    // Meilisearch wraps the request's own error; only the status is kept.
    const http = new Error('Request to http://key@meili.test failed', {
      cause: new Error(Errors.SearchRequestFailed, { cause: 503 }),
    });
    expect(await fail(http)).toMatchObject({
      state: 'failing',
      lastError: Errors.SearchRequestFailed,
      lastErrorParams: { status: 503 },
    });
    const refused = Object.assign(new Error('connect ECONNREFUSED secret'), {
      code: 'ECONNREFUSED',
    });
    const status = await fail(refused);
    expect(status.lastError).toBe(Errors.OutboundNetworkFailed);
    expect(status.lastErrorParams).toBeUndefined();
    expect(
      (await fail(new DOMException('slow', 'TimeoutError'))).lastError,
    ).toBe(Errors.OutboundTimeout);
    const tls = new TypeError('fetch failed', {
      cause: Object.assign(new Error('bad cert'), {
        code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      }),
    });
    expect((await fail(tls)).lastError).toBe(Errors.OutboundTlsFailed);
    expect(
      (await fail(new Error(Errors.SearchTaskFailed, { cause: 'raw' })))
        .lastError,
    ).toBe(Errors.SearchTaskFailed);
  });

  test('a failure stored in the engine wording reads as the generic failure', async () => {
    const settings = new MemorySettings();
    const search = new SearchService({
      settings,
      secrets: plainSecretBox,
      engine: new MemorySearchEngine(),
      source: new MemorySearchSource(),
      clock: fixedClock(),
      logger: recordingLogger().logger,
    });
    await search.update({ enabled: true, host: 'http://meili.test' });
    await settings.set('search.state', {
      ...((await settings.get('search.state')) as object),
      lastError: 'Meilisearch said: invalid key sk_live_secret',
    });
    expect((await search.status()).lastError).toBe(Errors.SearchSyncFailed);
  });

  test('a rebuild request replaces the whole index', async () => {
    const { search, source, engine } = setup();
    await search.update({ enabled: true, host: 'http://meili.test' });
    await search.sync();
    // Entries changed without a queued id (for example by a term rename) reach the index only by a rebuild.
    source.documentsById.set('x', doc('x', 'Hidden'));
    expect(await search.find(query('hidden'))).toEqual({ ids: [], total: 0 });
    await search.reindex();
    expect(await search.find(query('hidden'))).toBeNull();
    await search.sync();
    expect(await search.find(query('hidden'))).toEqual({
      ids: ['x'],
      total: 1,
    });
    expect(engine.indexes.get('cms_content')?.size).toBe(1);
  });
});
