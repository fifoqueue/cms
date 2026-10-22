import { SMTP_SECURITY } from '@cms/sdk';
import type { EmailSettingsInput } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  email: await adminFor(event).email.settings(),
});

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const security = text(form, 'security');
    const password = text(form, 'password');
    const input: EmailSettingsInput = {
      enabled: form.has('enabled'),
      host: text(form, 'host'),
      port: Math.trunc(Number(text(form, 'port'))) || 587,
      security: (SMTP_SECURITY as readonly string[]).includes(security)
        ? (security as EmailSettingsInput['security'])
        : 'starttls',
      username: text(form, 'username'),
      password: form.has('removePassword') ? '' : password || undefined,
      fromName: text(form, 'fromName'),
      fromEmail: text(form, 'fromEmail'),
    };
    try {
      await adminFor(event).email.update(input);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  test: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).email.test(text(form, 'to'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'emailTestSent' };
  },
};
