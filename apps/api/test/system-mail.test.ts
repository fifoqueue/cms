import { expect, test } from 'bun:test';
import { filterSystemMail } from '#api/domain/email/system-mail';
import { HookBus } from '#api/plugin-runtime/hook-bus';

test('system mail hides action credentials and restores only the anchor destination', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: { info() {}, warn() {}, error() {} },
  });
  const actionUrl = 'https://site.example/admin/password?token=SECRET';
  const core = { subject: 'Reset', text: `Reset:\n${actionUrl}` };
  const system = {
    kind: 'reset',
    actionUrl,
    context: {
      user: { id: 'user', name: 'Reader', email: 'reader@example.com' },
      site: { title: 'Site', url: 'https://site.example', locale: 'en' },
    },
  };

  hooks.registrar('valid').filter('email.system', (value, context) => {
    expect(JSON.stringify([value, context])).not.toContain('SECRET');

    return {
      ...value,
      subject: 'Welcome',
      html: '<p><a href="https://cms.invalid/action"><strong>Reset</strong></a></p>',
    };
  });
  const filtered = await filterSystemMail(hooks, core, system);

  expect(filtered.subject).toBe('Welcome');
  expect(filtered.text).toBe(core.text);
  expect(filtered.html).toContain(`href="${actionUrl}"`);
  expect(filtered.html).toContain('<strong>Reset</strong></a>');
  expect(filtered.html?.split(actionUrl)).toHaveLength(2);
});

test('duplicate, misplaced and missing protected markers fall back to the entire core mail', async () => {
  const marker = 'https://cms.invalid/action';
  const actionUrl = 'https://site.example/admin/password?token=SECRET';
  const core = { subject: 'Reset', text: `Reset:\n${actionUrl}` };
  const system = {
    kind: 'reset',
    actionUrl,
    context: {
      user: { id: 'user', name: 'Reader', email: 'reader@example.com' },
      site: { title: 'Site', url: 'https://site.example', locale: 'en' },
    },
  };

  for (const replacement of [
    { text: `${marker}\n${marker}` },
    { text: 'Removed' },
    {
      html: `<p><a href="${marker}">Reset</a></p><p><a href="${marker}">Again</a></p>`,
    },
    { html: `<a href="${marker}">${marker} ${marker}</a>` },
    { html: `<a href="${marker}">${marker}</a>` },
    { html: `<a href="${marker}"><strong>${marker}</strong></a>` },
    { html: `<img src="${marker}">` },
    {
      html: `<a href="${marker}">Reset</a><img src="https://evil.example/?url=${marker}">`,
    },
    {
      html: `<a href="${marker}">Reset</a><img src="https://img.example/image" alt="${marker}">`,
    },
    { html: '<p>Removed</p>' },
    { html: `<a href="${marker}/changed">Reset</a>` },
  ]) {
    const hooks = new HookBus({
      timeoutMs: 100,
      logger: { info() {}, warn() {}, error() {} },
    });

    hooks.registrar('valid').filter('email.system', (value) => ({
      ...value,
      subject: 'Previously accepted',
    }));
    hooks.registrar('invalid').filter('email.system', (value) => ({
      ...value,
      ...replacement,
    }));
    expect(await filterSystemMail(hooks, core, system)).toEqual(core);
  }
});
