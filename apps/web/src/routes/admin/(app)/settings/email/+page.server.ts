import { fail } from '@sveltejs/kit';
import { emailSettingsInputSchema } from '@cms/sdk';
import { Errors, failFrom, issuesOf, text } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import { readEmailForm } from '#lib/admin/settings/email-form.server.js';
import type { EmailFormValues } from '#lib/admin/settings/email-form.server.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  email: await adminFor(event).email.settings(),
});

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    // The declared fields of the chosen plugin transport decide how its values are read.
    const { availableTransports } = await adminFor(event).email.settings();
    const { values, input } = readEmailForm(form, availableTransports);
    const result = emailSettingsInputSchema.safeParse(input);
    if (!result.success)
      return fail(400, {
        values,
        message: Errors.FormInvalid,
        code: 'invalid_input',
        issues: issuesOf(result.error.issues),
      } satisfies FormFailure & { values: EmailFormValues });
    try {
      await adminFor(event).email.update(result.data);
    } catch (caught) {
      return failFrom(caught, { values });
    }
    return { notice: 'saved' };
  },
  test: async (event) => {
    const form = await event.request.formData();
    return submitAction(
      () => adminFor(event).email.test(text(form, 'to')),
      'emailTestSent',
    );
  },
};
