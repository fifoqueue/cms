import { describe, expect, test } from 'bun:test';
import { DEFAULT_PERMALINK_SETTINGS } from '@cms/sdk';
import type { ContentInput } from '@cms/sdk';
import { checkContentParent } from '#api/domain/content/hierarchy';
import {
  PublicContentService,
  PublishedContentReader,
} from '#api/domain/content/public-content';
import { TaxonomyService } from '#api/domain/taxonomy/taxonomy-service';
import { PermalinkService } from '#api/domain/permalinks/permalink-service';
import { PreviewService } from '#api/domain/content/preview-service';
import { RevisionService } from '#api/domain/content/revision-service';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { tiptapRenderer } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import type { DomainError } from '#api/shared/errors';
import {
  ADMIN,
  testFields,
  testTypes,
  plainSigner,
  testLocks,
  MemoryContentRepository,
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';
import {
  DEFAULT_EMBED_PRESETS,
  Embeds,
  presetProvider,
} from '#api/domain/content/embeds';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import { MemoryTaxonomyRepository } from '#test/support/memory-taxonomy';

test('page parent rejects moving a page beneath its own descendant', async () => {
  const child = { id: 'child', type: 'page', parentId: 'root' };

  await expect(
    checkContentParent(
      { id: 'root', type: 'page', parentId: child.id },
      async (id) => (id === child.id ? child : null),
    ),
  ).rejects.toMatchObject({
    code: 'invalid_input',
    issues: [{ path: 'parentId' }],
  });
});

const setup = () => {
  const repository = new MemoryContentRepository();
  const ids = sequentialIds();
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const taxonomy = new TaxonomyService({
    hooks,
    content: repository,
    repository: new MemoryTaxonomyRepository(repository),
    ids,
    clock: fixedClock(),
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
  const revisions = repository.revisions;
  /** Settings → Writing's default category. */
  const writing = { category: null as string | null };
  const service = testContentService({
    repository,
    hooks,
    ids,
    clock,
    defaultCategory: async () => writing.category,
  });
  /** Revision use cases over `service`, numbering their own ids unless given others. */
  const revisionService = (revisionIds = sequentialIds()) =>
    new RevisionService({
      hooks,
      content: service,
      revisions,
      renderer: tiptapRenderer,
      ids: revisionIds,
      clock,
    });
  const published = new MemoryPublishedContentRepository(repository);
  const protectedActions: string[] = [];
  const publicContent = new PublicContentService(
    new PublishedContentReader(published),
    hooks,
    testLocks(published, {
      check: async (attempt) => void protectedActions.push(attempt.action),
    }),
    new Embeds(() => DEFAULT_EMBED_PRESETS.map(presetProvider)),
    testFields(),
    testTypes(),
    undefined,
    async (id) =>
      [...repository.permalinks.paths.values()]
        .filter((path) => path.contentId === id)
        .map((path) => path.path),
  );
  return {
    service,
    publicContent,
    taxonomy,
    hooks,
    events,
    clock,
    repository,
    revisions,
    revisionService,
    protectedActions,
    writing,
  };
};

const input = (overrides: Partial<ContentInput> = {}): ContentInput => ({
  type: 'post',
  title: 'Hello World',
  document: textDocument('Body'),
  ...overrides,
});

const codeOf = async (promise: Promise<unknown>) =>
  ((await promise.catch((error: unknown) => error)) as DomainError).code;

describe('ContentService', () => {
  test('origin is private, immutable on creation and attributed to each saved revision', async () => {
    const { service, revisionService, publicContent } = setup();
    const actor = { id: ADMIN.id, role: 'author' };
    const first = { ip: '192.0.2.10', userAgent: 'Browser A' };
    const next = { ip: '192.0.2.20', userAgent: 'Browser B' };
    const created = await service.create(
      input({ status: 'published' }),
      actor,
      first,
    );
    expect(created.origin).toBeNull();
    const updated = await service.update(
      created.id,
      input({ title: 'Changed', status: 'published' }),
      ADMIN,
      undefined,
      next,
    );
    expect(updated.origin).toEqual({ created: first, modified: next });
    const history = await revisionService().list(created.id, ADMIN);
    expect(history[0]).toMatchObject(next);
    expect((await revisionService().list(created.id, actor))[0]).toMatchObject({
      ip: null,
      userAgent: null,
    });
    expect(await publicContent.getBySlug(created.slug)).not.toHaveProperty(
      'origin',
    );
  });
  test('private site reads require resolved capabilities and never expose drafts or admin fields', async () => {
    const { service, publicContent, repository } = setup();
    const entry = await service.create(input({ status: 'private' }), ADMIN);
    const resolver = new PermalinkResolver(
      repository.permalinks,
      publicContent,
    );
    expect(await codeOf(resolver.resolve({ path: entry.path }))).toBe(
      'not_found',
    );
    expect(
      await codeOf(
        resolver.resolve({ path: entry.path }, [], {
          id: 'reader',
          role: 'subscriber',
        }),
      ),
    ).toBe('not_found');
    const resolved = await resolver.resolve({ path: entry.path }, [], {
      id: 'editor',
      role: 'custom',
      capabilities: ['content.readPrivate'],
    });
    expect(resolved.content.html).toContain('Body');
    expect(resolved.content.seo.noIndex).toBe(true);
    for (const key of ['document', 'authorId', 'status', 'passwordHash'])
      expect(resolved.content).not.toHaveProperty(key);
    expect((await publicContent.list({})).items).toEqual([]);
    await service.update(entry.id, input({ status: 'draft' }), ADMIN);
    expect(
      await codeOf(resolver.resolve({ path: entry.path }, [], ADMIN)),
    ).toBe('not_found');
  });

  test("roles bound publishing and editing other users' entries", async () => {
    const { service } = setup();
    const contributor = { id: 'c', role: 'contributor' };
    const author = { id: 'a', role: 'author' };
    const editor = { id: 'e', role: 'editor' };

    expect(
      await codeOf(service.create(input({ status: 'published' }), contributor)),
    ).toBe('forbidden');
    const draft = await service.create(input(), contributor);
    const published = await service.create(
      input({ title: 'Live', status: 'published' }),
      author,
    );

    // Authors cannot touch someone else's entry; editors can.
    expect(await codeOf(service.get(draft.id, author))).toBe('forbidden');
    expect((await service.update(draft.id, input(), editor)).id).toBe(draft.id);
    // Contributors cannot publish even their own entry, nor delete published ones.
    expect(
      await codeOf(
        service.update(draft.id, input({ status: 'published' }), contributor),
      ),
    ).toBe('forbidden');
    expect(await codeOf(service.remove(published.id, contributor))).toBe(
      'forbidden',
    );
    expect(
      await codeOf(
        service.update(published.id, input({ authorId: 'c' }), author),
      ),
    ).toBe('forbidden');
  });

  test('trash and schedules decide what is public', async () => {
    const { service, publicContent, clock, events } = setup();
    const live = await service.create(input({ status: 'published' }), ADMIN);
    const later = await service.create(
      input({
        title: 'Later',
        status: 'scheduled',
        publishedAt: '2026-01-02T00:00:00.000Z',
      }),
      ADMIN,
    );
    const slugs = async () =>
      (await publicContent.list({})).items.map((item) => item.slug);

    expect(later.status).toBe('scheduled');
    expect(await slugs()).toEqual(['hello-world']);

    await service.trash(live.id, ADMIN);
    expect(await slugs()).toEqual([]);
    expect(await codeOf(publicContent.getBySlug('hello-world'))).toBe(
      'not_found',
    );
    await service.restore(live.id, ADMIN);
    expect(await slugs()).toEqual(['hello-world']);

    clock.set('2026-01-02T00:00:00.000Z');
    await service.publishDue();
    expect(await slugs()).toEqual(['later', 'hello-world']);
    expect(events).toContain('content.published:later');

    await service.trash(live.id, ADMIN);
    clock.set('2026-02-15T00:00:00.000Z');
    await service.emptyTrash(30);
    expect(await codeOf(service.get(live.id, ADMIN))).toBe('not_found');
    expect((await service.get(later.id, ADMIN)).status).toBe('published');
  });

  test('a protected body stays hidden, unsearchable and unlockable only with its current password', async () => {
    const { service, publicContent, protectedActions, repository } = setup();
    const entry = await service.create(
      input({ status: 'published', password: 'open-sesame' }),
      ADMIN,
    );
    repository.commentCounts.set(entry.id, 2);

    const locked = await publicContent.getBySlug('hello-world');
    expect(locked).toMatchObject({
      protected: true,
      html: '',
      excerpt: '',
      commentCount: 0,
    });
    expect((await publicContent.list({})).items[0]!.commentCount).toBe(0);
    expect((await publicContent.list({ search: 'Body' })).total).toBe(0);
    expect(
      await codeOf(publicContent.unlock(entry.id, { password: 'no' })),
    ).toBe('invalid_input');
    expect(protectedActions).toEqual(['contentUnlock']);

    const { token } = await publicContent.unlock(entry.id, {
      password: 'open-sesame',
    });
    const proof = `${entry.id}.${token}`;
    const unlocked = await publicContent.getBySlug('hello-world', [proof]);
    expect(unlocked.html).toContain('Body');
    expect(unlocked.commentCount).toBe(2);
    // Proofs are bound to the entry: another entry's id never matches.
    expect(
      (await publicContent.getBySlug('hello-world', [`other.${token}`])).html,
    ).toBe('');

    await service.update(
      entry.id,
      input({ status: 'published', password: 'changed' }),
      ADMIN,
    );
    expect((await publicContent.getBySlug('hello-world', [proof])).html).toBe(
      '',
    );
  });

  test('saves keep revisions, restores copy only the text, and previews show the autosave', async () => {
    const { service, revisions, clock, revisionService } = setup();
    const history = revisionService();
    const previews = new PreviewService({
      content: service,
      revisions,
      renderer: tiptapRenderer,
      signer: plainSigner,
      clock,
      embeds: new Embeds(() => []),
      fields: testFields(),
    });
    const entry = await service.create(input({ title: 'First' }), ADMIN);
    clock.set('2026-01-01T00:01:00.000Z');
    await service.update(
      entry.id,
      input({ title: 'Second', status: 'published' }),
      ADMIN,
    );

    const listed = await history.list(entry.id, ADMIN);
    expect(listed.map((revision) => revision.title)).toEqual([
      'Second',
      'First',
    ]);
    const restored = await history.restore(entry.id, listed[1]!.id, ADMIN);
    expect(restored).toMatchObject({ title: 'First', status: 'published' });

    clock.set('2026-01-01T00:02:00.000Z');
    await history.autosave(
      entry.id,
      { title: 'Draft idea', excerpt: '', document: input().document },
      ADMIN,
    );
    expect((await history.pendingAutosave(entry.id, ADMIN))?.title).toBe(
      'Draft idea',
    );
    const { token } = await previews.create(entry.id, ADMIN);
    expect((await previews.render(token)).title).toBe('Draft idea');
    expect(await codeOf(previews.render(`${token}x`))).toBe('not_found');
    clock.set('2026-01-01T02:00:00.000Z');
    expect(await codeOf(previews.render(token))).toBe('not_found');
  });

  test('a stale expected version changes nothing; an explicit date replaces the stored one', async () => {
    const { service, clock } = setup();
    const entry = await service.create(
      input({ status: 'published', publishedAt: '2026-04-01T00:00:00.000Z' }),
      ADMIN,
    );
    clock.set('2026-06-01T00:00:00.000Z');
    const body = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'New body' }] },
      ],
    };
    await service.update(
      entry.id,
      input({ status: 'published', document: body }),
      ADMIN,
    );
    // A metadata edit read the old version, then someone else saved the new body.
    expect(
      await codeOf(
        service.update(
          entry.id,
          input({
            status: 'published',
            title: 'Renamed',
            expectedUpdatedAt: entry.updatedAt,
          }),
          ADMIN,
        ),
      ),
    ).toBe('conflict');
    const current = await service.get(entry.id, ADMIN);
    expect(current.document).toEqual(body);
    expect(current.title).toBe('Hello World');

    const redated = await service.update(
      entry.id,
      input({
        status: 'published',
        document: body,
        publishedAt: '2026-05-01T00:00:00.000Z',
        expectedUpdatedAt: current.updatedAt,
      }),
      ADMIN,
    );
    expect(redated.publishedAt).toBe('2026-05-01T00:00:00.000Z');

    // Seconds are honored too: no form heuristic in the API.
    const seconds = await service.update(
      entry.id,
      input({
        status: 'published',
        document: body,
        publishedAt: '2026-05-01T00:00:45.000Z',
      }),
      ADMIN,
    );
    expect(seconds.publishedAt).toBe('2026-05-01T00:00:45.000Z');

    // Saves at the same clock value still advance the version.
    const same = await service.update(
      entry.id,
      input({ status: 'published', title: 'Same clock' }),
      ADMIN,
    );
    expect(same.updatedAt).not.toBe(seconds.updatedAt);
    expect(
      await codeOf(
        service.update(
          entry.id,
          input({ status: 'published', expectedUpdatedAt: seconds.updatedAt }),
          ADMIN,
        ),
      ),
    ).toBe('conflict');

    // Two overlapping writes from one version: exactly one wins.
    const results = await Promise.allSettled(
      ['Writer A', 'Writer B'].map((title) =>
        service.update(
          entry.id,
          input({
            status: 'published',
            title,
            expectedUpdatedAt: same.updatedAt,
          }),
          ADMIN,
        ),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
  });

  test('partial edits keep unsaved editor text: refused while an autosave is pending, never discarding one', async () => {
    const { service, clock, revisionService } = setup();
    const history = revisionService();
    const entry = await service.create(input(), ADMIN);
    const unsaved = {
      title: 'Hello World',
      excerpt: '',
      document: {
        type: 'doc' as const,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'UNSAVED BODY' }],
          },
        ],
      },
    };
    clock.set('2026-03-01T00:00:00.000Z');
    await history.autosave(entry.id, unsaved, ADMIN);
    const quick = (expectedUpdatedAt: string) =>
      service.update(
        entry.id,
        input({ title: 'Renamed', expectedUpdatedAt, preserveAutosave: true }),
        ADMIN,
      );
    expect(await codeOf(quick(entry.updatedAt))).toBe('conflict');
    expect((await history.pendingAutosave(entry.id, ADMIN))?.title).toBe(
      'Hello World',
    );

    // An autosave that raced a partial save (dated before it, written after) stays pending.
    await service.update(entry.id, input(), ADMIN);
    clock.set('2026-03-02T00:00:00.000Z');
    const renamed = await quick((await service.get(entry.id, ADMIN)).updatedAt);
    clock.set('2026-03-01T12:00:00.000Z');
    await history.autosave(entry.id, unsaved, ADMIN);
    expect(renamed.title).toBe('Renamed');
    expect((await history.pendingAutosave(entry.id, ADMIN))?.document).toEqual(
      unsaved.document,
    );

    // A partial save and an autosave overlapping: the autosave is never lost.
    await service.update(entry.id, input(), ADMIN);
    const latest = await service.get(entry.id, ADMIN);
    await Promise.allSettled([
      quick(latest.updatedAt),
      history.autosave(entry.id, unsaved, ADMIN),
    ]);
    expect(await history.pendingAutosave(entry.id, ADMIN)).not.toBeNull();
  });

  test('content and permalink changes are atomic and retain previously public URLs', async () => {
    const { service, publicContent, repository, hooks, clock } = setup();
    const settings = new PermalinkService(repository.permalinks);
    const resolver = new PermalinkResolver(
      repository.permalinks,
      publicContent,
    );
    const dates = {
      ...DEFAULT_PERMALINK_SETTINGS,
      post: '/p/%year%%month%%date%',
    };
    await settings.update(dates);
    const first = await service.create(input({ status: 'published' }), ADMIN);
    expect(first.path).toBe('/p/20260101');
    expect(
      await codeOf(
        service.create(input({ title: 'Other', status: 'published' }), ADMIN),
      ),
    ).toBe('conflict');
    expect((await service.list({}, ADMIN)).total).toBe(1);

    const titles = { ...DEFAULT_PERMALINK_SETTINGS, post: '/post/%title%' };
    await settings.update(titles);
    hooks.registrar('display').filter('content.public', (value) => ({
      ...value,
      title: 'Filtered title',
    }));
    expect((await publicContent.getById(first.id))?.path).toBe(
      '/post/Hello%20World',
    );
    const second = await service.create(
      input({ title: 'Other', status: 'published' }),
      ADMIN,
    );
    expect(
      await codeOf(
        service.update(
          second.id,
          input({ title: 'Hello World', status: 'published' }),
          ADMIN,
        ),
      ),
    ).toBe('conflict');
    expect(await service.get(second.id, ADMIN)).toMatchObject({
      title: 'Other',
      path: '/post/Other',
    });
    expect(await codeOf(settings.update(dates))).toBe('conflict');
    expect(await settings.get()).toEqual(titles);
    expect((await service.get(first.id, ADMIN)).path).toBe(
      '/post/Hello%20World',
    );

    const changed = await service.update(
      first.id,
      input({ title: 'Changed', status: 'published' }),
      ADMIN,
    );
    const redirect = await resolver.resolve({ path: '/p/20260101' });
    expect(redirect.redirect).toBe(true);
    expect(redirect.content.path).toBe('/post/Changed');
    expect(redirect.content.title).toBe('Filtered title');
    const draft = await service.update(
      first.id,
      input({ title: 'Changed' }),
      ADMIN,
    );
    expect(draft.publishedAt).toBe(first.publishedAt);
    expect(await publicContent.getById(first.id)).toBeNull();
    expect(await codeOf(resolver.resolve({ path: first.path }))).toBe(
      'not_found',
    );

    // Settings changes must retain links even while previously published content is a draft.
    await settings.update({ ...titles, post: '/story/%slug%' });
    clock.set('2026-02-01T00:00:00.000Z');
    const republished = await service.update(
      first.id,
      input({ title: 'Changed', status: 'published' }),
      ADMIN,
    );
    expect(republished.publishedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(republished.path).toBe('/story/hello-world');
    expect((await resolver.resolve({ path: changed.path })).content.path).toBe(
      republished.path,
    );
    await service.remove(first.id, ADMIN);
    expect(await repository.permalinks.findByPath(first.path)).toBeNull();
    expect(await repository.permalinks.findByPath(republished.path)).toBeNull();
  });
});
