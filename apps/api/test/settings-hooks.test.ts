import { expect, test } from 'bun:test';
import { z } from 'zod';
import type { SettingsSection } from '@cms/sdk/plugin';
import { filterSettings } from '#api/domain/site/settings-hooks';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

test('settings filters hide and preserve secrets while accepting valid changes', async () => {
  const bus = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const schema = z.object({ enabled: z.boolean(), secret: z.string() });
  const projection = {
    redact: (value: z.output<typeof schema>) => ({
      section: 'membership' as const,
      settings: { enabled: value.enabled },
    }),
    restore: (
      value: { settings: { enabled: boolean } },
      original: z.output<typeof schema>,
    ) => ({ ...value.settings, secret: original.secret }),
    parse: (value: unknown) => schema.safeParse(value),
  };
  const input = { enabled: false, secret: 'private' };

  expect(await filterSettings(bus, input, projection)).toBe(input);
  bus
    .registrar('functions:site', { trusted: true })
    .filter('settings.beforeSave', (value) => {
      expect(value).toEqual({
        section: 'membership',
        settings: { enabled: false },
      });

      return {
        section: 'membership',
        settings: { enabled: true, secret: 'replacement' },
      } as unknown as SettingsSection;
    });
  expect(await filterSettings(bus, input, projection)).toEqual({
    enabled: true,
    secret: 'private',
  });
});

test('settings filters reject invalid values and changed section identity', async () => {
  for (const changedSection of [false, true]) {
    const bus = new HookBus({
      timeoutMs: 100,
      logger: recordingLogger().logger,
    });
    const schema = z.object({ enabled: z.boolean() });
    const input = { enabled: false };

    bus.registrar('functions:site', { trusted: true }).filter(
      'settings.beforeSave',
      () =>
        (changedSection
          ? { section: 'site', settings: { enabled: true } }
          : {
              section: 'membership',
              settings: { enabled: 'invalid' },
            }) as unknown as SettingsSection,
    );
    const result = await filterSettings(bus, input, {
      redact: (settings) => ({ section: 'membership', settings }),
      restore: (value) => value.settings,
      parse: (value) => schema.safeParse(value),
    });

    expect(result).toEqual({ enabled: false });
  }
});
