import { ADMIN_LOCALES, can } from '@cms/sdk';
import type { AdminLocale } from '@cms/sdk';
import { authApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import {
  profileFieldsOf,
  saveProfileFields,
} from '#lib/server/profile-fields.js';
import {
  cancelStep,
  chooseFactor,
  continueStep,
  enrollStep,
  pendingEnrollment,
} from '#lib/server/sign-in.js';
import { stepView } from '#lib/server/sign-in-view.js';
import { linkSso, ssoApi } from '#lib/server/sso.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { fetch, locals } = event;
  const sso = ssoApi(fetch, locals.token);
  const auth = authApi(fetch, locals.token);
  const enrollment = pendingEnrollment(event);
  const [info, status, tokens, sessions, recovery, factors, profileFields] =
    await Promise.all([
      sso.info(),
      sso.identity(),
      auth.tokens.list(),
      auth.sessions.list(),
      // Recovery codes are a way back in for administrators while only single sign-on signs in.
      locals.user && can(locals.user, 'settings.manage')
        ? auth.recoveryCodes.status()
        : null,
      auth.factors.list(),
      profileFieldsOf(event, locals.user!.id),
    ]);

  return {
    sso: {
      providers: info.providers.map(({ id, name }) => ({ id, name })),
    },
    factors: {
      required: factors.required,
      factors: factors.factors.map(
        ({ id, label, enrolled, enrollable, credentials }) => ({
          id,
          label,
          enrolled,
          enrollable,
          credentials: credentials.map((credential) => ({
            id: credential.id,
            label: credential.label,
            createdAt: credential.createdAt,
          })),
        }),
      ),
    },
    /** Private fields plugins declare, with this user's values. */
    profileFields,
    /** The second factor being set up, if its steps are under way. */
    enrollment: enrollment && stepView(enrollment.step, enrollment.owner),
    identities: status.identities.map(
      ({ id, issuer, subject, linkedAt, providers }) => ({
        id,
        issuer,
        subject,
        linkedAt,
        providers,
      }),
    ),
    assigned: status.assigned,
    recovery: recovery && {
      remaining: recovery.remaining,
      createdAt: recovery.createdAt,
    },
    tokens,
    sessions: sessions.map(({ id, createdAt, expiresAt, current }) => ({
      id,
      createdAt,
      expiresAt,
      current,
    })),
  };
};

const locale = (value: string): AdminLocale | '' =>
  (ADMIN_LOCALES as readonly string[]).includes(value)
    ? (value as AdminLocale)
    : '';

export const actions: Actions = {
  password: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).changePassword({
        current: text(form, 'current'),
        password: text(form, 'password'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'passwordChanged' };
  },

  tokenCreate: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    const days = Math.trunc(Number(text(form, 'expiresInDays')));
    try {
      const created = await authApi(fetch, locals.token).tokens.create({
        name: text(form, 'name'),
        expiresInDays: days > 0 ? days : undefined,
      });
      // Shown once, to the user who created it; never stored by the web app.
      return { notice: 'tokenCreated', token: created.token };
    } catch (caught) {
      return failFrom(caught);
    }
  },

  /** Signs out one of the user's other sessions. */
  sessionRevoke: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).sessions.revoke(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'sessionRevoked' };
  },

  tokenRevoke: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).tokens.revoke(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },

  profile: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    try {
      await authApi(fetch, locals.token).profile.update({
        email: text(form, 'email'),
        name: text(form, 'name'),
        slug: text(form, 'slug'),
        bio: text(form, 'bio'),
        locale: locale(text(form, 'locale')),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },

  profileFields: (event) => saveProfileFields(event, event.locals.user!.id),

  /** Sends the signed-in user to the provider; the callback links the account they choose there. */
  link: async (event) => {
    const form = await event.request.formData();
    return linkSso(event, text(form, 'provider'));
  },

  /** Starts setting up a second factor; its steps show in the two-step section. */
  factorEnroll: async (event) => {
    const form = await event.request.formData();
    return enrollStep(event, text(form, 'factor'));
  },
  factorContinue: (event) => continueStep(event, ['enroll']),
  factorChoose: (event) => chooseFactor(event, ['enroll']),
  factorCancel: (event) => cancelStep(event),

  factorRemove: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    return submitAction(
      () =>
        authApi(fetch, locals.token).factors.remove(
          text(form, 'factor'),
          text(form, 'credential'),
        ),
      'factorRemoved',
    );
  },

  unlink: async ({ fetch, locals, request }) => {
    const form = await request.formData();
    return submitAction(
      () => ssoApi(fetch, locals.token).unlink(text(form, 'id')),
      'ssoAccountUnlinked',
    );
  },

  /** Replaces the recovery codes; the new ones are shown once, never stored by the web app. */
  recoveryGenerate: async ({ fetch, locals }) => {
    try {
      const { codes } = await authApi(
        fetch,
        locals.token,
      ).recoveryCodes.generate();
      return { notice: 'recoveryCodesGenerated', codes };
    } catch (caught) {
      return failFrom(caught);
    }
  },

  recoveryRemove: ({ fetch, locals }) =>
    submitAction(
      () => authApi(fetch, locals.token).recoveryCodes.remove(),
      'recoveryCodesRemoved',
    ),
};
