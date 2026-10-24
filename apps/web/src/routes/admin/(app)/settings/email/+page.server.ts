import { SMTP_SECURITY } from '@cms/sdk';
import type { EmailSettingsInput } from '@cms/sdk';
import { text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import { secretInput } from '#lib/admin/settings/input.server.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  email: await adminFor(event).email.settings(),
});

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const security = text(form, 'security');
    const input: EmailSettingsInput = {
      enabled: form.has('enabled'),
      host: text(form, 'host'),
      port: Math.trunc(Number(text(form, 'port'))) || 587,
      security: (SMTP_SECURITY as readonly string[]).includes(security)
        ? (security as EmailSettingsInput['security'])
        : 'starttls',
      username: text(form, 'username'),
      password: secretInput(form, 'password', 'removePassword'),
      fromName: text(form, 'fromName'),
      fromEmail: text(form, 'fromEmail'),
    };
    return submitAction(() => adminFor(event).email.update(input));
  },
  test: async (event) => {
    const form = await event.request.formData();
    return submitAction(
      () => adminFor(event).email.test(text(form, 'to')),
      'emailTestSent',
    );
  },
};
