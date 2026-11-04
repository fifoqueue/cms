import { expect, test } from 'bun:test';
import { I18nService } from '#api/domain/i18n/service';
import { Translations } from '#api/domain/i18n/translations';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

test('translation filters accept valid edits and reject changed context', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const service = new I18nService(new Translations(), hooks);

  expect(await service.messages('en', 'site')).toEqual({});
  expect(await service.locale('en', 'site')).toBe('en');
  const registrar = hooks.registrar('site', { trusted: true });

  registrar.filter('i18n.locale', (value) => ({ ...value, locale: 'ko' }));
  registrar.filter('i18n.locale', (value) => ({ ...value, locale: 'invalid' }));
  registrar.filter('i18n.messages', (value) => ({
    ...value,
    messages: { commentCount: 'Count: {count}' },
  }));
  registrar.filter('i18n.messages', (value) => {
    value.messages.commentCount = '<script>{count}</script>';

    return value;
  });
  expect(await service.locale('en', 'site')).toBe('ko');
  expect(await service.messages('ko', 'site')).toEqual({
    commentCount: 'Count: {count}',
  });
});
