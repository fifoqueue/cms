import { expect, test } from 'bun:test';
import {
  captchaWidgetSchema,
  captchaOriginSchema,
  DEFAULT_SECURITY_SETTINGS,
  publicCaptchaSchema,
} from '@cms/sdk';
import { CaptchaRegistry } from '#api/domain/security/captcha-registry';
import { SecuritySettingsService } from '#api/domain/security/security-settings';
import { CORE_CAPTCHA_WIDGETS } from '#api/domain/security/captcha-widgets';
import { MemorySettings, recordingLogger } from '#test/support/memory';
import { plainSecretBox } from '#test/support/memory-security';

const widget = {
  script: 'https://captcha.example/widget.js',
  render: null,
  origins: [],
  attributes: { 'data-theme': 'dark' },
  responseField: 'captcha-response',
};

test('widget declarations reject executable attributes, unsafe URLs, unbounded data and field injection', () => {
  expect(captchaWidgetSchema.safeParse(widget).success).toBe(true);
  for (const script of [
    'javascript:alert(1)',
    'http://captcha.example/a.js',
    'https://u:p@captcha.example/a.js',
    '/local.js',
    'https://captcha.example/a.js#fragment',
  ])
    expect(captchaWidgetSchema.safeParse({ ...widget, script }).success).toBe(
      false,
    );
  for (const attributes of [
    { onclick: 'alert(1)' },
    { style: 'display:none' },
    { 'data-x': 'x'.repeat(1025) },
    Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`data-x${i}`, 'x']),
    ),
  ])
    expect(
      captchaWidgetSchema.safeParse({ ...widget, attributes }).success,
    ).toBe(false);
  for (const responseField of ['', 'field[name]', 'x" onclick="evil'])
    expect(
      captchaWidgetSchema.safeParse({ ...widget, responseField }).success,
    ).toBe(false);
});

test('render paths and CSP origins are bounded data, not expressions or directive fragments', () => {
  for (const render of [
    null,
    'turnstile.render',
    '$captcha._render',
    'a.b.c.d',
  ])
    expect(captchaWidgetSchema.safeParse({ ...widget, render }).success).toBe(
      true,
    );
  for (const render of [
    'render()',
    'a["render"]',
    'a..b',
    'a.b.c.d.e',
    '1render',
    'render;alert',
    'x'.repeat(257),
  ])
    expect(captchaWidgetSchema.safeParse({ ...widget, render }).success).toBe(
      false,
    );
  for (const origin of [
    'https://example.com',
    'https://*.hcaptcha.com',
    'https://example.com:8443',
    'https://[2001:db8::1]',
  ])
    expect(captchaOriginSchema.safeParse(origin).success).toBe(true);
  for (const origin of [
    'http://example.com',
    'https://example.com/',
    'https://example.com/path',
    'https://example.com?query',
    'https://example.com#fragment',
    'https://user:pass@example.com',
    'https://*',
    'https://foo.*.example.com',
    'https://*.example.com/path',
    'https://example.com:99999',
    'https://example.com;script-src *',
    "https://example.com 'unsafe-inline'",
  ])
    expect(captchaOriginSchema.safeParse(origin).success).toBe(false);
  expect(
    captchaWidgetSchema.safeParse({
      ...widget,
      origins: Array(11).fill('https://example.com'),
    }).success,
  ).toBe(false);
  const registry = new CaptchaRegistry({
    timeoutMs: 10,
    logger: recordingLogger().logger,
  });
  expect(() =>
    registry.register('plugin:example:invalid', {
      label: 'Invalid',
      widget: { ...widget, render: 'x()' },
      verify: () => true,
    }),
  ).toThrow();
  expect(registry.list()).toEqual([]);
  expect(
    captchaWidgetSchema.parse({
      script: widget.script,
      attributes: {},
      responseField: widget.responseField,
    }),
  ).toMatchObject({ render: null, origins: [] });
});

test('auto widgets receive the public site key without replacing an explicit attribute', async () => {
  const registry = new CaptchaRegistry({
    timeoutMs: 10,
    logger: recordingLogger().logger,
  });
  const id = 'plugin:example:auto';
  const attributes = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`data-x${i}`, 'value']),
  );
  registry.register(id, {
    label: 'Auto',
    widget: { ...widget, attributes },
    verify: () => true,
  });
  const service = new SecuritySettingsService(
    new MemorySettings(),
    plainSecretBox,
    undefined,
    () => registry.list(),
    (id) => registry.widget(id),
  );
  await service.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: {
      ...DEFAULT_SECURITY_SETTINGS.captcha,
      provider: id,
      siteKey: 'public-key',
      secretKey: 'secret',
    },
  });
  expect((await service.getPublic()).widget?.attributes).toEqual({
    ...attributes,
    'data-sitekey': 'public-key',
  });
  expect(registry.widget(id)?.attributes).not.toHaveProperty('data-sitekey');
  const release = registry.register(id, {
    label: 'Override',
    widget: { ...widget, attributes: { 'data-sitekey': 'widget-key' } },
    verify: () => true,
  });
  expect((await service.getPublic()).widget?.attributes['data-sitekey']).toBe(
    'widget-key',
  );
  release();
  registry.register(id, {
    label: 'Explicit',
    widget: {
      ...widget,
      render: 'example.render',
      origins: ['https://*.example.com'],
    },
    verify: () => true,
  });
  const explicit = (await service.getPublic()).widget!;
  expect(explicit.attributes).not.toHaveProperty('data-sitekey');
  expect(explicit.render).toBe('example.render');
  expect(explicit.origins).toEqual(['https://*.example.com']);
});

test('core descriptors match the provider-documented rendering functions and CSP hosts', () => {
  const expected = {
    turnstile: {
      render: 'turnstile.render',
      origins: ['https://challenges.cloudflare.com'],
    },
    hcaptcha: {
      render: 'hcaptcha.render',
      origins: ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
    },
    recaptcha: {
      render: 'grecaptcha.render',
      origins: [
        'https://www.google.com',
        'https://www.gstatic.com',
        'https://recaptcha.google.com',
      ],
    },
  };
  for (const [id, descriptor] of Object.entries(CORE_CAPTCHA_WIDGETS)) {
    expect(captchaWidgetSchema.parse(descriptor)).toMatchObject(
      expected[id as keyof typeof expected],
    );
    expect(new URL(descriptor.script).searchParams.get('render')).toBe(
      'explicit',
    );
  }
});

test('public widget follows the active registration, derives CSP origin and never exposes verification secrets', async () => {
  const registry = new CaptchaRegistry({
    timeoutMs: 10,
    logger: recordingLogger().logger,
  });
  const id = 'plugin:example:challenge';
  const release = registry.register(id, {
    label: 'Example',
    widget,
    verify: () => true,
  });
  const service = new SecuritySettingsService(
    new MemorySettings(),
    plainSecretBox,
    undefined,
    () => registry.list(),
    (id) => registry.widget(id),
  );
  await service.update({
    ...DEFAULT_SECURITY_SETTINGS,
    captcha: {
      ...DEFAULT_SECURITY_SETTINGS.captcha,
      provider: id,
      siteKey: 'public-key',
      secretKey: 'private-secret',
    },
  });
  const dto = publicCaptchaSchema.parse(await service.getPublic());
  expect(dto.widget).toEqual({
    ...widget,
    attributes: { ...widget.attributes, 'data-sitekey': 'public-key' },
    scriptOrigin: 'https://captcha.example',
  });
  expect(JSON.stringify(dto)).not.toContain('private-secret');
  const override = registry.register(id, {
    label: 'No widget',
    verify: () => false,
  });
  expect((await service.getPublic()).widget).toBeNull();
  override();
  expect((await service.getPublic()).widget?.scriptOrigin).toBe(
    'https://captcha.example',
  );
  release();
  expect((await service.getPublic()).widget).toBeNull();
  expect(
    await registry.verify({
      provider: id,
      token: 'x',
      secret: 's',
      address: null,
      minimumScore: 0.5,
    }),
  ).toBe(false);
  for (const [id, widget] of Object.entries(CORE_CAPTCHA_WIDGETS)) {
    registry.registerCore(id, { label: id, widget, verify: () => true });
    expect(captchaWidgetSchema.parse(registry.widget(id))).toEqual(widget);
  }
});
