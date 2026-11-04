import { expect, test } from 'bun:test';
import { ContentTypeService } from '#api/domain/content/content-types';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

test('definition filters customize builtins but cannot change their identity', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = new ContentTypeService(
    {
      list: async () => ({}),
      get: async () => undefined,
      set: async () => {},
    },
    async () => false,
    hooks,
  );
  const registrar = hooks.registrar('functions:site', { trusted: true });
  registrar.filter('contentType.definition', (value) => ({
    ...value,
    name: 'Display',
    searchable: false,
  }));
  registrar.filter('contentType.definition', (value) => ({
    ...value,
    key: 'forged',
    builtin: false,
  }));
  expect(await service.require('post')).toMatchObject({
    key: 'post',
    builtin: true,
    name: 'Display',
    searchable: false,
  });
});
