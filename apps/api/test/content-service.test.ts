import { describe, expect, test } from 'bun:test';
import type { ContentInput } from '@cms/sdk';
import { ContentService } from '../src/domain/content/content-service';
import {
  PublicContentService,
  PublishedContentReader,
} from '../src/domain/content/public-content';
import { tiptapRenderer } from '../src/infra/system';
import { HookBus } from '../src/plugin-runtime/hook-bus';
import type { DomainError } from '../src/shared/errors';
import {
  MemoryContentRepository,
  fixedClock,
  recordingLogger,
  sequentialIds,
} from './support/memory';

const setup = () => {
  const repository = new MemoryContentRepository();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const events: string[] = [];
  const listener = hooks.registrar('listener');
  for (const name of [
    'content.created',
    'content.updated',
    'content.published',
    'content.deleted',
  ] as const) {
    listener.on(name, (entry) => void events.push(`${name}:${entry.slug}`));
  }
  const clock = fixedClock();
  const service = new ContentService({
    repository,
    renderer: tiptapRenderer,
    hooks,
    ids: sequentialIds(),
    clock,
  });
  const publicContent = new PublicContentService(
    new PublishedContentReader(repository),
    hooks,
  );
  return { service, publicContent, hooks, events, clock };
};

const input = (overrides: Partial<ContentInput> = {}): ContentInput => ({
  type: 'post',
  title: 'Hello World',
  document: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
  },
  ...overrides,
});

const codeOf = async (promise: Promise<unknown>) =>
  ((await promise.catch((error: unknown) => error)) as DomainError).code;

describe('ContentService', () => {
  test('creates drafts with generated, unique slugs and rendered HTML', async () => {
    const { service } = setup();
    const first = await service.create(input(), 'user');
    const second = await service.create(input(), 'user');
    expect(first).toMatchObject({
      slug: 'hello-world',
      status: 'draft',
      publishedAt: null,
      html: '<p>Body</p>',
    });
    expect(second.slug).toBe('hello-world-2');
  });

  test('falls back to an id-based slug for titles without ASCII letters', async () => {
    const { service } = setup();
    expect(
      (await service.create(input({ title: '안녕하세요' }), 'user')).slug,
    ).toMatch(/^post-[0-9a-f]+$/);
  });

  test('rejects taken slugs, invalid input and documents outside the schema', async () => {
    const { service } = setup();
    await service.create(input({ slug: 'taken' }), 'user');
    expect(await codeOf(service.create(input({ slug: 'taken' }), 'user'))).toBe(
      'conflict',
    );
    expect(await codeOf(service.create({ title: '' }, 'user'))).toBe(
      'invalid_input',
    );
    const iframe = { type: 'doc' as const, content: [{ type: 'iframe' }] };
    expect(
      await codeOf(service.create(input({ document: iframe }), 'user')),
    ).toBe('invalid_input');
  });

  test('publishing sets publishedAt once and emits events', async () => {
    const { service, events, clock } = setup();
    const draft = await service.create(input(), 'user');
    clock.set('2026-02-01T00:00:00.000Z');
    const published = await service.update(
      draft.id,
      input({ status: 'published' }),
    );
    clock.set('2026-03-01T00:00:00.000Z');
    const edited = await service.update(
      draft.id,
      input({ status: 'published', title: 'Edited' }),
    );
    await service.remove(draft.id);
    await Bun.sleep(5);

    expect(published.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(edited.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(edited.slug).toBe('hello-world');
    expect(events).toEqual([
      'content.created:hello-world',
      'content.updated:hello-world',
      'content.published:hello-world',
      'content.updated:hello-world',
      'content.deleted:hello-world',
    ]);
  });

  test('plugins can transform content before saving, but not break it', async () => {
    const { service, hooks } = setup();
    const plugin = hooks.registrar('plugin');
    plugin.filter('content.beforeSave', (data) => ({
      ...data,
      excerpt: 'auto excerpt',
    }));
    plugin.filter('content.beforeSave', (data) => ({ ...data, title: '' }));
    const entry = await service.create(input(), 'user');
    expect(entry).toMatchObject({
      title: 'Hello World',
      excerpt: 'auto excerpt',
    });
  });

  test('the public API serves published content only', async () => {
    const { service, publicContent } = setup();
    await service.create(input({ title: 'Draft' }), 'user');
    await service.create(input({ title: 'Live', status: 'published' }), 'user');
    expect(
      (await publicContent.list({})).items.map((item) => item.slug),
    ).toEqual(['live']);
    expect(await codeOf(publicContent.getBySlug('draft'))).toBe('not_found');
  });
});
