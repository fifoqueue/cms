import { describe, expect, test } from 'bun:test';
import type { PublicContent, SiteSettings } from '@cms/sdk';
import { HookBus } from '../src/plugin-runtime/hook-bus';
import { recordingLogger } from './support/memory';

const site: SiteSettings = { title: 'Site', description: '', locale: 'en' };
const content: PublicContent = {
  id: '1',
  type: 'post',
  slug: 's',
  title: 'T',
  excerpt: '',
  html: '',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  meta: {},
};

describe('HookBus', () => {
  test('skips filters that throw, time out or return invalid values', async () => {
    const { logger, lines } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 20, logger });
    const hooks = bus.registrar('p');
    hooks.filter('content.beforeSave', () => {
      throw new Error('boom');
    });
    hooks.filter('content.beforeSave', () => new Promise(() => {}));
    hooks.filter('content.beforeSave', () => 'nope' as never);
    hooks.filter('content.beforeSave', (value) => ({
      ...value,
      title: `${value.title}!`,
    }));

    const input = {
      type: 'post' as const,
      title: 'T',
      excerpt: '',
      document: { type: 'doc' as const },
      status: 'draft' as const,
    };
    const result = await bus.applyFilter(
      'content.beforeSave',
      input,
      (value) => typeof value === 'object',
    );
    expect(result.title).toBe('T!');
    expect(lines.filter((line) => line.startsWith('warn'))).toHaveLength(3);
  });

  test('runs filters by priority, then registration order', async () => {
    const bus = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    const hooks = bus.registrar('p');
    const append = (suffix: string) => (value: PublicContent) => ({
      ...value,
      title: value.title + suffix,
    });
    hooks.filter('content.public', append('2'), 20);
    hooks.filter('content.public', append('1'), 5);
    hooks.filter('content.public', append('3'), 20);
    const result = await bus.applyFilter('content.public', content, () => true);
    expect(result.title).toBe('T123');
  });

  test('handlers receive copies, so they cannot mutate core state', async () => {
    const bus = new HookBus({
      timeoutMs: 50,
      logger: recordingLogger().logger,
    });
    bus.registrar('p').on('site.updated', (payload) => {
      (payload as SiteSettings).title = 'mutated';
    });
    const original = { ...site };
    await bus.emit('site.updated', original);
    expect(original.title).toBe('Site');
  });

  test('emit never rejects and unsubscribe removes the handler', async () => {
    const { logger, lines } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 50, logger });
    const off = bus.registrar('p').on('site.updated', () => {
      throw new Error('boom');
    });
    await bus.emit('site.updated', site);
    off();
    await bus.emit('site.updated', site);
    expect(lines).toEqual(['warn Plugin "p" failed on "site.updated": boom']);
  });
});
