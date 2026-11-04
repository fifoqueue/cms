import { expect, test } from 'bun:test';
import { discussionSettingsSchema } from '@cms/sdk';
import { AvatarService } from '#api/domain/comments/avatar-service';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { plainSigner, recordingLogger } from '#test/support/memory';

test('avatar URL filters avoid identity reads without handlers and accept only fixed-context HTTP URLs', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  let reads = 0;
  const service = new AvatarService(
    {
      email: async () => {
        reads++;
        return ' Person@Example.com ';
      },
    },
    {
      image: async () => ({
        bytes: new Uint8Array(),
        contentType: 'image/png',
      }),
    },
    plainSigner,
    {
      hooks,
      hash: (email) => {
        expect(email).toBe('person@example.com');
        return 'email-hash';
      },
      siteUrl: async () => 'https://site.example',
    },
  );
  const settings = discussionSettingsSchema.parse({ showAvatars: true });
  const original = await service.url('author:person', settings);
  expect(reads).toBe(0);
  const plugin = hooks.registrar('provider');
  const release = plugin.filter('avatar.url', (value) => {
    expect(Object.keys(value).sort()).toEqual(['emailHash', 'size', 'url']);
    return { ...value, url: 'https://images.example/avatar.png' };
  });
  expect(await service.url('author:person', settings)).toBe(
    'https://images.example/avatar.png',
  );
  release();
  plugin.filter('avatar.url', (value) => ({
    ...value,
    url: 'javascript:alert(1)',
  }));
  expect(await service.url('author:person', settings)).toBe(original);
  hooks
    .registrar('functions:site', { trusted: true })
    .filter('avatar.url', (value) => {
      value.emailHash = 'changed';
      value.url = 'https://images.example/changed.png';
      return value;
    });
  expect(await service.url('author:person', settings)).toBe(original);
});
