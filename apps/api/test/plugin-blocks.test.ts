import { expect, test } from 'bun:test';
import type { ContentDocument } from '@cms/sdk';
import { definePlugin } from '@cms/sdk/plugin';
import { ContentService } from '#api/domain/content/content-service';
import { tiptapRenderer } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  ADMIN,
  MemoryContentRepository,
  fixedClock,
  noUsers,
  plainHasher,
  recordingLogger,
  sequentialIds,
  testFields,
  testTypes,
} from '#test/support/memory';
import { MemoryRevisionRepository } from '#test/support/memory-revisions';
import { createRuntime } from '#test/support/runtime';

const blocksPlugin = definePlugin({
  manifest: { id: 'greeter', name: 'Greeter', version: '1.0.0' },
  activate({ blocks }) {
    blocks.register('hello', {
      title: 'Hello',
      attributes: [
        { key: 'name', label: 'Name', type: 'text', default: 'World' },
        {
          key: 'tone',
          label: 'Tone',
          type: 'select',
          options: ['calm', 'loud'],
        },
      ],
      render: (attrs, { content }) =>
        `<p>Hello ${String(attrs.name)} on ${content?.slug ?? '-'}</p>`,
    });
    blocks.register('broken', {
      title: 'Broken',
      render: () => {
        throw new Error('boom');
      },
    });
    blocks.register('slow', {
      title: 'Slow',
      render: () => new Promise<string>(() => undefined),
    });
  },
});

const document = (block: string, attrs: Record<string, unknown> = {}) =>
  ({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'pluginBlock', attrs: { block, attrs } },
    ],
  }) as ContentDocument;

test('plugin blocks render through isolation, are checked on save and survive the plugin', async () => {
  const runtime = createRuntime();
  await runtime.host.install(runtime.bundles.register('g', blocksPlugin));
  await runtime.host.enable('greeter');
  const repository = new MemoryContentRepository();
  const service = new ContentService({
    repository,
    renderer: tiptapRenderer,
    hooks: new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
    ids: sequentialIds(),
    clock: fixedClock(),
    users: noUsers,
    revisions: new MemoryRevisionRepository(),
    hasher: plainHasher,
    types: testTypes(),
    fields: testFields(),
    blocks: runtime.blocks,
  });

  expect(runtime.blocks.list().map((block) => block.block)).toEqual([
    'plugin:greeter:hello',
    'plugin:greeter:broken',
    'plugin:greeter:slow',
  ]);
  const html = tiptapRenderer.render(
    document('plugin:greeter:hello', { name: 'Ann <b>' }),
  );
  const context = {
    content: { id: '1', type: 'post', slug: 'hi', path: '/hi', title: 'Hi' },
  };
  expect(await runtime.blocks.expand(html, context)).toBe(
    '<p>Before</p><p>Hello Ann <b> on hi</p>',
  );

  // Declared attributes are enforced on save while the plugin is active.
  const invalid = await service
    .create(
      {
        type: 'post',
        title: 'Bad',
        document: document('plugin:greeter:hello', { tone: 'shouty' }),
      },
      ADMIN,
    )
    .catch((error: { code: string }) => error.code);
  expect(invalid).toBe('invalid_input');

  // Failing and hanging blocks render nothing; the rest of the page stays.
  for (const block of ['plugin:greeter:broken', 'plugin:greeter:slow'])
    expect(
      await runtime.blocks.expand(tiptapRenderer.render(document(block))),
    ).toBe('<p>Before</p>');

  // Disabled: nothing renders, and the block is still stored when the entry is saved.
  await runtime.host.disable('greeter');
  expect(runtime.blocks.list()).toEqual([]);
  expect(await runtime.blocks.expand(html, context)).toBe('<p>Before</p>');
  const saved = await service.create(
    {
      type: 'post',
      title: 'Kept',
      document: document('plugin:greeter:hello', { tone: 'shouty' }),
    },
    ADMIN,
  );
  expect(saved.document.content?.[1]).toEqual({
    type: 'pluginBlock',
    attrs: { block: 'plugin:greeter:hello', attrs: { tone: 'shouty' } },
  });
});
