import { describe, expect, test } from 'bun:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

describe('HookBus', () => {
  test('trusted filter snapshots survive queued mutations without copying arguments', async () => {
    const bus = new HookBus({
      timeoutMs: 100,
      logger: recordingLogger().logger,
    });
    const hooks = bus.registrar('functions:site', { trusted: true });
    const retained = { user: {} as never, method: 'password', allowed: true };
    const context = { bytes: new Uint8Array([1]), callback: () => undefined };
    const observed: boolean[] = [];

    hooks.filter('user.signInAllowed', (_value, arg) => {
      expect(arg).toBe(context);
      queueMicrotask(() =>
        queueMicrotask(() => {
          retained.allowed = false;
        }),
      );

      return retained;
    });
    const result = await bus.applyFilter(
      'user.signInAllowed',
      retained,
      (value) => (value as typeof retained).allowed,
      (_owner, _previous, next) => {
        observed.push(next.allowed);
      },
      [context],
    );

    expect(retained.allowed).toBe(false);
    expect(result.allowed).toBe(true);
    expect(observed).toEqual([true]);
  });

  test('rejected trusted mutations restore values without cloning context bytes', async () => {
    for (const throws of [false, true]) {
      const bus = new HookBus({
        timeoutMs: 100,
        logger: recordingLogger().logger,
      });
      const hooks = bus.registrar('functions:site', { trusted: true });
      const bytes = new Uint8Array([1, 2, 3]);
      const input = {
        url: '/original',
        key: 'original',
        driver: 'local',
        variant: null,
      };
      let borrowed: unknown;

      hooks.filter('media.url', (value, context) => {
        borrowed = context;
        value.url = 'javascript:alert(1)';
        value.key = 'changed';
        if (throws) throw new Error('failed after mutation');

        return value;
      });
      const result = await bus.applyFilter(
        'media.url',
        input,
        (value) => (value as typeof input).url === '/original',
        undefined,
        [bytes],
      );

      expect(result).toEqual({
        url: '/original',
        key: 'original',
        driver: 'local',
        variant: null,
      });
      expect(borrowed).toBe(bytes);
    }
  });

  test('shared memory cannot cross plugin input or result boundaries', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const plugin = bus.registrar('p');
    const site = bus.registrar('s', { trusted: true });
    const bytes = new Uint8Array(new SharedArrayBuffer(8));
    const graph = { nested: new Map([[{ key: true }, new Set([bytes])]]) };
    let calls = 0;

    plugin.on('site.updated', () => {
      calls++;
      bytes[0] = 9;
    });
    site.on('site.updated', () => {
      expect(bytes[0]).toBe(0);
    });
    await bus.emit('site.updated', graph as never);
    expect(calls).toBe(0);
    site.define('memory', { kind: 'filter', validate: () => true });
    plugin.filter('memory', () => graph);
    const result = await site.apply('memory', { safe: true });

    bytes[0] = 7;
    expect(result).toEqual({ safe: true });
    expect(await plugin.apply('memory', graph)).toBe(graph);
  });

  test('custom dispatch uses the stable value it validated', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const hooks = bus.registrar('p');
    const source = { valid: true };

    for (const kind of ['action', 'filter'] as const) {
      source.valid = true;
      hooks.define(kind, {
        kind,
        validate: (value) => {
          const valid = (value as typeof source).valid;

          source.valid = false;

          return valid;
        },
      });

      if (kind === 'action') {
        hooks.on(kind, (value) => {
          expect(value).toEqual({ valid: true });
        });
        await hooks.do(kind, source);
      } else {
        hooks.filter(kind, (value) => value);
        expect(await hooks.apply(kind, source)).toEqual({ valid: true });
      }
    }
  });

  test('undefined names and released registrations retain no metadata', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const hooks = bus.registrar('s');

    for (let i = 0; i < 32; i++) {
      const name = `missing.${i}`;

      await hooks.do(name, null);
      await hooks.apply(name, null);
      hooks.removeAll(name, 10);
      hooks.remove(name, () => {});
      const release = hooks.on(name, () => {});

      release();
      expect(hooks.did(name)).toBe(0);
    }

    const release = hooks.define('temporary', {
      kind: 'action',
      validate: () => true,
    });

    await hooks.do('temporary', null);
    release();
    expect(hooks.did('temporary')).toBe(0);
    const state = bus as unknown as {
      counts: Map<string, number>;
      actions: Map<string, unknown>;
      filters: Map<string, unknown>;
    };

    expect([state.counts.size, state.actions.size, state.filters.size]).toEqual(
      [0, 0, 0],
    );
  });

  test('detached dispatch ancestry retains only active frames', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const hooks = bus.registrar('s', { trusted: true });

    type Frame = { parent?: Frame };
    const context = (
      bus as unknown as { dispatchContext: AsyncLocalStorage<Frame> }
    ).dispatchContext;
    let next: () => Promise<void> = () => bus.emit('site.updated', {} as never);

    hooks.on('site.updated', () => {
      let depth = 0;

      for (let frame = context.getStore(); frame; frame = frame.parent) depth++;
      expect(depth).toBe(1);
      next = AsyncLocalStorage.bind(() =>
        bus.emit('site.updated', {} as never),
      );
    });
    for (let i = 0; i < 16; i++) await next();
  });

  test('plugin output is owned before asynchronous validation yields', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const retained = { user: {} as never, method: 'password', allowed: true };

    bus.registrar('plugin').filter('user.signInAllowed', () => retained);
    let entered!: () => void;
    let release!: () => void;
    const validating = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = bus.applyFilter(
      'user.signInAllowed',
      retained,
      async () => {
        entered();
        await gate;

        return true;
      },
    );

    await validating;
    retained.allowed = false;
    release();
    expect((await pending).allowed).toBe(true);
  });

  test('empty custom dispatch counts calls without validating or cloning', async () => {
    const { logger } = recordingLogger();
    const hooks = new HookBus({ timeoutMs: 100, logger }).registrar('site');
    const validate = () => {
      throw new Error('must not validate');
    };

    hooks.define('empty.action', { kind: 'action', validate });
    hooks.define('empty.filter', { kind: 'filter', validate });
    const uncloneable = () => undefined;

    await hooks.do('empty.action', uncloneable);
    expect(await hooks.apply('empty.filter', uncloneable)).toBe(uncloneable);
    expect(hooks.did('empty.action')).toBe(1);
    expect(hooks.did('empty.filter')).toBe(1);
  });

  test('custom contracts validate inputs and results and release pre-registered handlers', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const plugin = bus.registrar('plugin');
    const site = bus.registrar('site', { trusted: true });
    const scope = new PluginScope();

    plugin.filter('custom.price', () => 'invalid');
    site.filter('custom.price', (value) => (value as number) + 2);
    expect(await site.apply('custom.price', 3)).toBe(3);
    scope.track(() =>
      site.define('custom.price', {
        kind: 'filter',
        validate: (value) => typeof value === 'number',
      }),
    );
    expect(await site.apply('custom.price', 3)).toBe(5);
    expect(await site.apply('custom.price', 'invalid')).toBe('invalid');
    expect(() =>
      plugin.define('custom.price', {
        kind: 'filter',
        validate: () => true,
      }),
    ).toThrow();
    expect(() =>
      site.define('content.created', {
        kind: 'action',
        validate: () => true,
      }),
    ).toThrow();
    expect(() =>
      site.define('media.uploadAllowed', {
        kind: 'filter',
        validate: () => true,
      }),
    ).toThrow();
    scope.dispose();
    expect(site.has('custom.price')).toBe(true);
    expect(await site.apply('custom.price', 3)).toBe(3);
    const release = site.define('custom.price', {
      kind: 'filter',
      validate: () => true,
    });

    release();
  });

  test('custom actions validate payloads, isolate plugins and keep trusted identity', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const plugin = bus.registrar('plugin');
    const site = bus.registrar('site', { trusted: true });
    const payload = { message: 'original' };
    let calls = 0;

    plugin.on('custom.notice', (value) => {
      (value as typeof payload).message = 'changed';
      throw new Error('isolated');
    });
    site.on('custom.notice', (value) => {
      expect(value).toEqual(payload);
      expect(payload.message).toBe('original');
      calls++;
    });
    site.define('custom.notice', {
      kind: 'action',
      validate: (value) => value !== null && typeof value === 'object',
    });
    await site.do('custom.notice', null);
    expect(calls).toBe(0);
    await site.do('custom.notice', payload);
    expect(calls).toBe(1);
  });

  test('async introspection is dispatch-local and clears after settlement', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const hooks = bus.registrar('site', { trusted: true });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let detached!: () => string | undefined;

    hooks.on('user.signInFailed', async () => {
      expect(hooks.current()).toBe('user.signInFailed');
      await gate;
      expect(hooks.current()).toBe('user.signInFailed');
      expect(hooks.doing('site.updated')).toBe(false);
      detached = AsyncLocalStorage.bind(() => hooks.current());
    });
    hooks.on('site.updated', () => {
      expect(hooks.current()).toBe('site.updated');
      expect(hooks.doing('user.signInFailed')).toBe(false);
      release();
    });
    const first = bus.emit('user.signInFailed', {
      method: 'password',
      account: null,
    });

    expect(hooks.current()).toBeUndefined();
    expect(hooks.doing()).toBe(false);
    await bus.emit('site.updated', {} as never);
    await first;
    expect(detached()).toBeUndefined();
    expect(hooks.doing()).toBe(false);
  });

  test('removal affects queued handlers and dispatch counts include empty hooks', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const hooks = bus.registrar('site', { trusted: true });
    const seen: number[] = [];
    const later = () => {
      seen.push(2);
    };

    hooks.on('user.signInFailed', later, 20);
    hooks.on('user.signInFailed', () => {
      seen.push(1);
      hooks.remove('user.signInFailed', later);
    });
    expect(hooks.has('user.signInFailed', later)).toBe(true);
    await bus.emit('user.signInFailed', {
      method: 'password',
      account: null,
    });
    expect(seen).toEqual([1]);
    expect(hooks.has('user.signInFailed', later)).toBe(false);
    hooks.removeAll('user.signInFailed', 20);
    expect(hooks.has('user.signInFailed')).toBe(true);
    hooks.removeAll('user.signInFailed');
    expect(hooks.has('user.signInFailed')).toBe(false);
    await bus.emit('user.signInFailed', {
      method: 'password',
      account: null,
    });
    expect(hooks.did('user.signInFailed')).toBe(2);
  });

  test('actions settle in priority order and filters isolate context arguments', async () => {
    const { logger } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 100, logger });
    const hooks = bus.registrar('plugin');
    const order: number[] = [];

    hooks.on(
      'user.signInFailed',
      () => {
        order.push(2);
      },
      20,
    );
    hooks.on(
      'user.signInFailed',
      async () => {
        await Promise.resolve();
        order.push(1);
      },
      1,
    );
    await bus.emit('user.signInFailed', {
      method: 'password',
      account: null,
    });
    expect(order).toEqual([1, 2]);
    const context = { flag: false };

    hooks.filter('user.signInAllowed', (value, arg) => {
      (arg as typeof context).flag = true;

      return value;
    });
    const trusted = bus.registrar('site', { trusted: true });

    trusted.filter('user.signInAllowed', (value, arg) => {
      expect(arg).toBe(context);
      expect(context.flag).toBe(false);

      return value;
    });
    await bus.applyFilter(
      'user.signInAllowed',
      { user: {} as never, method: 'password', allowed: true },
      () => true,
      undefined,
      [context],
    );
    expect(context.flag).toBe(false);
  });

  test('trusted filters preserve identity while skipping failures and invalid results', async () => {
    const { logger, lines } = recordingLogger();
    const bus = new HookBus({ timeoutMs: 20, logger });
    const hooks = bus.registrar('site', { trusted: true });
    const input = { user: {} as never, method: 'password', allowed: false };

    hooks.filter('user.signInAllowed', () => {
      throw new Error('boom');
    });
    hooks.filter('user.signInAllowed', () => null as never);
    hooks.filter('user.signInAllowed', (value) => {
      expect(value).toEqual(input);

      return { ...value, allowed: true };
    });
    const result = await bus.applyFilter(
      'user.signInAllowed',
      input,
      (value) => value !== null && typeof value === 'object',
    );

    expect(result.allowed).toBe(true);
    expect(lines.filter((line) => line.startsWith('warn'))).toHaveLength(2);
  });

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
