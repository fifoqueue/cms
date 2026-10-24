// Content fixtures and a content service on in-memory adapters, shared by service tests.
import { toPublicEntrySeo } from '@cms/sdk';
import type { ContentDocument, PublicContent } from '@cms/sdk';
import { ContentService } from '#api/domain/content/content-service';
import type { ContentServiceDeps } from '#api/domain/content/content-service';
import { tiptapRenderer } from '#api/infra/system';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  MemoryContentRepository,
  fixedClock,
  noUsers,
  plainHasher,
  recordingLogger,
  sequentialIds,
  testFields,
  testTypes,
} from '#test/support/memory';

/** A document with one paragraph of `text`. */
export const textDocument = (text: string): ContentDocument => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** A published entry as the public API returns it. */
export const publicEntry = (
  overrides: Partial<PublicContent> = {},
): PublicContent => ({
  id: '1',
  type: 'post',
  slug: 'hello',
  path: '/hello',
  seo: toPublicEntrySeo({}),
  title: 'Hello',
  excerpt: '',
  html: '<p>Hi</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  categories: [],
  tags: [],
  extraTerms: [],
  author: null,
  sticky: false,
  commentCount: 0,
  protected: false,
  featuredImage: null,
  fields: {},
  meta: {},
  ...overrides,
});

/** `ContentService` on in-memory adapters with built-in types and no other users. */
export const testContentService = ({
  repository = new MemoryContentRepository(),
  hooks = new HookBus({ timeoutMs: 50, logger: recordingLogger().logger }),
  ids = sequentialIds(),
  clock = fixedClock(),
  types = testTypes(),
  fields = testFields(),
  ...deps
}: Partial<ContentServiceDeps> = {}) =>
  new ContentService({
    repository,
    renderer: tiptapRenderer,
    hooks,
    ids,
    clock,
    users: noUsers,
    hasher: plainHasher,
    types,
    fields,
    ...deps,
  });
