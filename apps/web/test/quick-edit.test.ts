import { expect, test } from 'bun:test';
import type { ContentEntry } from '@cms/sdk';
import { readQuickEdit } from '#lib/server/quick-edit.js';

const entry = {
  id: 'e1',
  type: 'post',
  title: 'Old',
  slug: 'old',
  excerpt: 'Kept excerpt',
  document: { type: 'doc', content: [{ type: 'paragraph' }] },
  status: 'scheduled',
  publishedAt: '2026-12-01T09:30:15.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  extraTerms: [
    { id: 'topic-1', name: 'Topic', slug: 'topic', taxonomy: 'topic' },
  ],
} as unknown as ContentEntry;

test('Quick Edit keeps what it does not show: custom terms and the scheduled date', () => {
  const form = new FormData();
  form.set('title', 'New');
  form.set('status', 'scheduled');
  form.set('updatedAt', '2026-10-01T00:00:00.000Z');
  const { input } = readQuickEdit(entry, form);
  expect(input).toMatchObject({
    title: 'New',
    excerpt: 'Kept excerpt',
    extraTermIds: ['topic-1'],
    publishedAt: '2026-12-01T09:30:15.000Z',
    expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
    preserveAutosave: true,
  });
  expect(input).not.toHaveProperty('seo');
});
