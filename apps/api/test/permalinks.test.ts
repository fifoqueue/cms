import { expect, test } from 'bun:test';
import {
  DEFAULT_PERMALINK_SETTINGS,
  permalinkPathSchema,
  permalinkSettingsSchema,
  renderPermalink,
} from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import type { PermalinkSubject } from '#api/domain/permalinks/content-path';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { PermalinkService } from '#api/domain/permalinks/permalink-service';
import { DomainError } from '#api/shared/errors';
import { MemoryPermalinkRepository } from '#test/support/memory-permalinks';

const codeOf = async (task: () => Promise<unknown>) => {
  try {
    await task();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return 'ok';
};

test('permalink workflow: templates, atomic regeneration, redirects, drafts and exact encoding', async () => {
  type Item = PermalinkSubject & { status: 'draft' | 'published' };
  const contents = new Map<string, Item>();
  const paths = new MemoryPermalinkRepository(() => contents.values());
  const service = new PermalinkService(paths);
  const resolver = new PermalinkResolver(paths, {
    getById: async (id) =>
      contents.get(id)?.status === 'published'
        ? ({ id, path: paths.current(id)! } as PublicContent)
        : null,
  });
  /** A content write: the path is assigned first, so a refused path stores nothing. */
  const save = async (source: Item) => {
    const previous = contents.get(source.id);
    const path = await paths.assign(source, !!previous?.publishedAt);
    contents.set(source.id, source);
    return path;
  };
  const resolve = (path: string) => resolver.resolve({ path });
  const item = (
    id: string,
    slug: string,
    title: string,
    publishedAt: string | null,
  ): Item => ({
    id,
    type: 'post',
    slug,
    title,
    status: publishedAt ? 'published' : 'draft',
    publishedAt: publishedAt ? new Date(publishedAt) : null,
    createdAt: new Date('2026-10-01T09:00:00Z'),
  });
  const title = 'Café Ünï Ä';
  const encodedTitle = `/post/${encodeURIComponent(title)}`;

  // Fresh sites keep `/<slug>`; drafts own a path but are never served.
  expect(await service.get()).toEqual(DEFAULT_PERMALINK_SETTINGS);
  expect(await save(item('a', 'hello', 'Hello', '2026-10-22T23:30:00Z'))).toBe(
    '/hello',
  );
  await save(item('b', 'cafe', title, '2026-10-23T00:00:00Z'));
  await save(item('c', 'twin', 'Twin', '2026-10-22T01:00:00Z'));
  await save(item('d', 'secret', 'Secret', null));
  expect(await resolve('/hello')).toEqual({
    content: { id: 'a', path: '/hello' } as PublicContent,
    redirect: false,
  });
  expect(await codeOf(() => resolve('/secret'))).toBe('not_found');

  // A backfilled legacy path inside a now-reserved namespace stays saveable while unchanged.
  const legacy: Item = {
    ...item('l', 'api', 'Legacy', '2026-01-01T00:00:00Z'),
    type: 'page',
  };
  contents.set('l', legacy);
  paths.paths.set('/api', { path: '/api', contentId: 'l', current: true });
  expect(await save({ ...legacy, title: 'Legacy v2' })).toBe('/api');

  // UTC date template; two posts on one day collide, so nothing changes.
  expect(
    renderPermalink('/p/%year%%month%%date%', {
      id: 'a',
      slug: 'hello',
      title: 'Hello',
      publishedAt: '2026-10-22T23:30:00Z',
      createdAt: '2026-10-01T09:00:00Z',
    }),
  ).toBe('/p/20261022');
  const before = structuredClone([...paths.paths]);
  expect(
    await codeOf(() =>
      service.update({
        ...DEFAULT_PERMALINK_SETTINGS,
        post: '/p/%year%%month%%date%',
      }),
    ),
  ).toBe('conflict');
  expect([...paths.paths]).toEqual(before);
  expect(await service.get()).toEqual(DEFAULT_PERMALINK_SETTINGS);

  // Title template: encoded exactly once, with no case folding.
  await service.update({
    ...DEFAULT_PERMALINK_SETTINGS,
    post: '/post/%title%',
  });
  expect(paths.current('b')).toBe(encodedTitle);
  expect(permalinkPathSchema.safeParse(encodedTitle).success).toBe(true);
  expect(await resolve(encodedTitle)).toMatchObject({ redirect: false });
  expect(await resolve('/cafe')).toMatchObject({
    content: { id: 'b' },
    redirect: true,
  });
  expect(
    await resolve(
      encodedTitle.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase()),
    ),
  ).toMatchObject({
    content: { id: 'b' },
    redirect: true,
  });
  expect(await codeOf(() => resolve('/post/hello'))).toBe('not_found');
  expect(await codeOf(() => resolve('/post/Café/Ünï Ä'))).toBe('not_found');
  expect(await codeOf(() => resolve('/post/%2E%2E'))).toBe('not_found');
  for (const unsafe of [
    '/admin%2Flogin',
    '/news/..%2Fadmin',
    '/x%5Cy',
    '/x%00y',
  ])
    expect(permalinkPathSchema.safeParse(unsafe).success).toBe(false);

  // Back to slugs: the old path is reclaimed, every earlier path redirects to it directly.
  await service.update(DEFAULT_PERMALINK_SETTINGS);
  expect(paths.current('a')).toBe('/hello');
  expect(await resolve('/post/Hello')).toMatchObject({
    content: { id: 'a' },
    redirect: true,
  });

  // Redirects of published content cannot be taken; drafts release theirs.
  await save({ ...item('a', 'hello-world', 'Hello', '2026-10-22T23:30:00Z') });
  expect(
    await codeOf(() => save(item('e', 'hello', 'New', '2026-10-24T00:00:00Z'))),
  ).toBe('conflict');
  expect(contents.has('e')).toBe(false);
  expect(await resolve('/hello')).toMatchObject({
    content: { id: 'a' },
    redirect: true,
  });
  await save(item('d', 'secret-2', 'Secret', null));
  expect(await save(item('f', 'secret', 'Other', null))).toBe('/secret');

  // Unpublished content (first publication kept) disappears from current paths and redirects.
  await save({
    ...item('a', 'hello-world', 'Hello', '2026-10-22T23:30:00Z'),
    status: 'draft',
  });
  expect(await codeOf(() => resolve('/hello'))).toBe('not_found');
  expect(await codeOf(() => resolve('/hello-world'))).toBe('not_found');

  // Regeneration keeps its once-public path as a redirect; unchanged legacy paths survive.
  await service.update({
    ...DEFAULT_PERMALINK_SETTINGS,
    post: '/post/%title%',
  });
  expect(await paths.findByPath('/hello-world')).toEqual({
    contentId: 'a',
    current: false,
  });
  expect(paths.current('l')).toBe('/api');

  // New claims of reserved paths and unusable values refuse the write.
  for (const write of [
    item('g', 'dots', '..', '2026-10-24T00:00:00Z'),
    { ...item('f', 'admin', 'Other', null), type: 'page' as const },
    item('h', 'notes', 'notes.md', null),
    item('i', 'separator', 'admin/login', null),
  ])
    expect(await codeOf(() => save(write))).toBe('invalid_input');
  expect(paths.current('f')).toBe('/post/Other');

  // Templates cannot shadow reserved routes or carry traversal or queries.
  for (const pattern of [
    '/category/%slug%',
    '/%slug%.md',
    '/Admin/%slug%',
    '/api/%slug%',
    '//%slug%',
    '/p/../%slug%',
    '/p\\%slug%',
    '/p/%slug%?x=1',
    '/%invalid-token%',
    '/p/static',
  ])
    expect(
      permalinkSettingsSchema.safeParse({
        ...DEFAULT_PERMALINK_SETTINGS,
        post: pattern,
      }).success,
    ).toBe(false);
});
