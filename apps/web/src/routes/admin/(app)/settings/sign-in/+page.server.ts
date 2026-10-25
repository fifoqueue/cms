import { fail } from '@sveltejs/kit';
import { ROLES, can } from '@cms/sdk/capabilities';
import { signInSettingsSchema } from '@cms/sdk';
import {
  moveItem,
  readMove,
  readSignInForm,
  signInInput,
  signInValues,
} from '#lib/admin/settings/sign-in-form.js';
import type { SignInFormValues } from '#lib/admin/settings/sign-in-form.js';
import { Errors, failFrom, issuesOf, text } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/** Settings → Sign-in: which methods sign in (in login-page order), second factors and roles. */
export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'settings.manage');
  const admin = adminFor(event);
  const [settings, roles] = await Promise.all([
    admin.signInSettings.get(),
    // Custom roles are listed with `users.manage`; without it, the built-in roles.
    event.locals.user && can(event.locals.user, 'users.manage')
      ? admin.roles.list()
      : null,
  ]);
  return {
    values: signInValues(settings),
    available: {
      methods: settings.available.methods.map(
        ({ id, label, source, ready }) => ({ id, label, source, ready }),
      ),
      secondFactors: settings.available.secondFactors.map(
        ({ id, label, source }) => ({ id, label, source }),
      ),
    },
    roles: (roles ?? ROLES.map((key) => ({ key, name: key }))).map(
      ({ key, name }) => ({ key, name }),
    ),
    passwordForced: settings.passwordForced,
  };
};

export const actions: Actions = {
  save: async (event) => {
    requireCapability(event.locals, 'settings.manage');
    const values = readSignInForm(await event.request.formData());
    const result = signInSettingsSchema.safeParse(signInInput(values));
    if (!result.success)
      return fail(400, {
        values,
        message: Errors.FormInvalid,
        code: 'invalid_input',
        issues: issuesOf(result.error.issues),
      } satisfies FormFailure & { values: SignInFormValues });
    try {
      await adminFor(event).signInSettings.update(result.data);
    } catch (caught) {
      return failFrom(caught, { values });
    }
    return { notice: 'saved' };
  },
  /** Moves a method up or down without saving; with scripts the page does this in place. */
  move: async (event) => {
    requireCapability(event.locals, 'settings.manage');
    const form = await event.request.formData();
    const values = readSignInForm(form);
    const move = readMove(text(form, 'move'));
    if (!move) return { values };
    const order = moveItem(values.order, move.index, move.offset);
    return {
      values: {
        ...values,
        order,
        methods: order.filter((id) => values.methods.includes(id)),
      },
    };
  },
};
