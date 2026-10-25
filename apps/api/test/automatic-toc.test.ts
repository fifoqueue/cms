import { expect, mock, test } from 'bun:test';
import type { ContentDocument, ContentInput } from '@cms/sdk';
import { TocRenderer } from '#api/domain/content/automatic-toc';
import type { ContentRenderRecord } from '#api/domain/content/content-repository';
import { PublishedContentReader } from '#api/domain/content/public-content';
import { PreviewService } from '#api/domain/content/preview-service';
import { WritingService } from '#api/domain/site/writing-service';
import { tiptapRenderer } from '#api/infra/system';
import { MemoryPublishedContentRepository } from '#test/support/memory-published';
import {
  ADMIN,
  MemoryContentRepository,
  MemorySettings,
  fixedClock,
  plainSigner,
  testFields,
} from '#test/support/memory';
import { testContentService, textDocument } from '#test/support/content';

const heading = {
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text: 'Section' }],
};
const document: ContentDocument = {
  type: 'doc',
  content: [
    ...textDocument('Introduction').content!,
    heading,
    heading,
    heading,
  ],
};

const setup = () => {
  const repository = new MemoryContentRepository();
  const clock = fixedClock();
  const service = testContentService({ repository, clock });
  const writing = new WritingService(new MemorySettings());
  const fetchBody = mock((ids: readonly string[]) => repository.findByIds(ids));
  const settings = mock(async () => ({
    writing: await writing.get(),
    locale: 'en',
  }));
  const renderer = new TocRenderer({
    content: { findByIds: fetchBody },
    settings,
  });
  const renderBody = mock(renderer.published.bind(renderer));
  const reader = new PublishedContentReader(
    new MemoryPublishedContentRepository(repository),
    renderBody,
  );
  const previews = new PreviewService({
    content: service,
    revisions: repository.revisions,
    renderer: tiptapRenderer,
    signer: plainSigner,
    clock,
    embeds: { expand: async (html) => html },
    fields: testFields(),
    renderBody: (doc, record) => renderer.preview(doc, record),
  });
  const create = (input: Partial<ContentInput> = {}) =>
    service.create(
      {
        type: 'post',
        title: 'Contents',
        status: 'published',
        document,
        ...input,
      },
      ADMIN,
    );
  return {
    repository,
    clock,
    service,
    writing,
    fetchBody,
    settings,
    renderBody,
    reader,
    previews,
    create,
  };
};

test('public detail and body lists apply current policy without resaving', async () => {
  const { create, writing, reader } = setup();
  for (const override of ['default', 'always', 'never'] as const) {
    const entry = await create({ title: override, tocOverride: override });
    for (const enabled of [false, true]) {
      await writing.update({ autoToc: { enabled } });
      const html = (await reader.getById(entry.id))!.html;
      expect(html.includes('<nav')).toBe(
        override === 'always' || (override === 'default' && enabled),
      );
      expect((await reader.getBySlug(entry.slug))!.html).toBe(html);
      expect(
        (await reader.list()).items.find((item) => item.id === entry.id)!.html,
      ).toBe(html);
    }
  }
  for (const [nodes, count] of [
    [[heading, heading], 0],
    [[{ type: 'tableOfContents' }, heading, heading, heading], 1],
    [
      [
        heading,
        heading,
        heading,
        { type: 'pageBreak' },
        heading,
        heading,
        heading,
      ],
      2,
    ],
  ] as const) {
    const entry = await create({
      document: { type: 'doc', content: [...nodes] },
    });
    expect(
      (await reader.getById(entry.id))!.html.match(/<nav /g)?.length ?? 0,
    ).toBe(count);
  }
});

test('inapplicable entries avoid authoring reads; locked entries never render', async () => {
  const { create, writing, reader, fetchBody, settings, renderBody } = setup();
  const never = await create({ tocOverride: 'never' });
  await reader.getById(never.id);
  expect(settings).not.toHaveBeenCalled();
  const normal = await create();
  await writing.update({ autoToc: { enabled: false } });
  await reader.getById(normal.id);
  await writing.update({ autoToc: { types: ['page'] } });
  await reader.getById(normal.id);
  expect(fetchBody).not.toHaveBeenCalled();
  const locked = await create({ password: 'secret', tocOverride: 'always' });
  renderBody.mockClear();
  expect((await reader.getById(locked.id))!.html).toBe('');
  expect((await reader.list({ include: [locked.id] })).items[0]!.html).toBe('');
  expect(renderBody).not.toHaveBeenCalled();
  expect(fetchBody).not.toHaveBeenCalled();
});

test('concurrent changes cannot replace an authorized snapshot with new content', async () => {
  const { create, repository, reader, fetchBody } = setup();
  const entry = await create();
  const saved = (await repository.findByIds([entry.id]))[0]!;
  const changes: (Partial<ContentRenderRecord> | null)[] = [
    null,
    { updatedAt: new Date(saved.updatedAt.getTime() + 1) },
    ...(['draft', 'private', 'scheduled'] as const).map((status) => ({
      status,
    })),
    { trashedAt: new Date() },
    { protected: true },
    { html: '<p>new private text</p>' },
  ];
  for (const change of changes) {
    fetchBody.mockImplementation(async () =>
      change === null
        ? []
        : [
            {
              ...saved,
              document: textDocument('new private text'),
              ...change,
            },
          ],
    );
    expect((await reader.getById(entry.id))!.html).toBe(saved.html);
    expect((await reader.list()).items[0]!.html).toBe(saved.html);
  }
});

test('placement and preview share current policy, including autosaved text', async () => {
  const { create, writing, reader, previews, repository, clock } = setup();
  const entry = await create();
  const { token } = await previews.create(entry.id, ADMIN);
  expect((await previews.render(token)).html).toBe(
    (await reader.getById(entry.id))!.html,
  );
  for (const position of ['top', 'beforeFirstHeading'] as const) {
    await writing.update({ autoToc: { position } });
    const html = (await reader.getById(entry.id))!.html;
    expect(html.startsWith('<nav')).toBe(position === 'top');
    expect(html.indexOf('<nav')).toBeLessThan(html.indexOf('<h2'));
    expect((await previews.render(token)).html).toBe(html);
  }
  clock.set('2026-01-01T00:01:00.000Z');
  await repository.revisions.autosave({
    id: 'toc-autosave',
    contentId: entry.id,
    authorId: ADMIN.id,
    kind: 'autosave',
    title: 'Autosaved',
    excerpt: '',
    document: textDocument('Not enough headings'),
    createdAt: clock.now(),
  });
  expect((await previews.render(token)).html).toBe(
    '<p>Not enough headings</p>',
  );
  expect((await reader.getById(entry.id))!.html).toContain('<nav');
});

test('each list reads settings once and fetches only eligible bodies in one batch', async () => {
  const { create, reader, settings, fetchBody } = setup();
  const first = await create();
  const second = await create({ tocOverride: 'always' });
  const never = await create({ tocOverride: 'never' });
  const page = await create({ type: 'page' });
  const locked = await create({ password: 'secret' });
  const result = await reader.list();
  expect(settings).toHaveBeenCalledTimes(1);
  expect(fetchBody).toHaveBeenCalledTimes(1);
  expect(new Set(fetchBody.mock.calls[0]![0])).toEqual(
    new Set([first.id, second.id]),
  );
  for (const id of [first.id, second.id])
    expect(result.items.find((item) => item.id === id)!.html).toContain('<nav');
  for (const id of [never.id, page.id, locked.id])
    expect(result.items.find((item) => item.id === id)!.html).not.toContain(
      '<nav',
    );
  await reader.list();
  expect(settings).toHaveBeenCalledTimes(2);
  expect(fetchBody).toHaveBeenCalledTimes(2);
});
