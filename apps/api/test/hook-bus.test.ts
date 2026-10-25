import { describe, expect, test } from 'bun:test';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

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
      categoryIds: [],
      tagIds: [],
      sticky: false,
      allowComments: true,
    };
    const result = await bus.applyFilter(
      'content.beforeSave',
      input,
      (value) => typeof value === 'object',
    );
    expect(result.title).toBe('T!');
    expect(lines.filter((line) => line.startsWith('warn'))).toHaveLength(3);
  });
});
