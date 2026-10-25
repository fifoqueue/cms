import { fail } from '@sveltejs/kit';
import { SSO_PROVIDERS_MAX, ssoSettingsInputSchema } from '@cms/sdk';
import { Errors, failFrom, issuesOf, text } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import {
  blankProvider,
  ssoProviderValues,
} from '#lib/admin/settings/sso-form.js';
import type { SsoProviderValues } from '#lib/admin/settings/sso-form.js';
import { readSsoProviders } from '#lib/admin/settings/sso-form.server.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const sso = await adminFor(event).ssoSettings.get();
  return {
    providers: ssoProviderValues(sso.providers),
    /** Saved provider IDs with a stored client secret. */
    secrets: sso.providers
      .filter((provider) => provider.clientSecretConfigured)
      .map((provider) => provider.id),
    redirectUri: sso.redirectUri,
    environmentProvider: sso.environmentProvider && {
      id: sso.environmentProvider.id,
      name: sso.environmentProvider.name,
    },
  };
};

/** A key for a provider added without scripts; unique among the page's drafts. */
const draftKey = () =>
  `server-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const { values, input: providers } = readSsoProviders(form);
    const admin = adminFor(event);
    const result = ssoSettingsInputSchema.safeParse({ providers });
    if (!result.success)
      return fail(400, {
        values,
        message: Errors.FormInvalid,
        code: 'invalid_input',
        issues: issuesOf(result.error.issues),
      } satisfies FormFailure & { values: SsoProviderValues[] });
    try {
      await admin.ssoSettings.update(result.data);
    } catch (caught) {
      return failFrom(caught, { values });
    }
    return { notice: 'saved' };
  },
  /** Adds an empty provider without saving; with scripts the page does this in place. */
  add: async (event) => {
    const { values } = readSsoProviders(await event.request.formData());
    return {
      values:
        values.length < SSO_PROVIDERS_MAX
          ? [...values, blankProvider(draftKey())]
          : values,
    };
  },
  /** Takes a provider out of the form without saving; with scripts the page does this in place. */
  remove: async (event) => {
    const form = await event.request.formData();
    const { values } = readSsoProviders(form);
    const index = Number(text(form, 'remove'));
    return { values: values.filter((_, at) => at !== index) };
  },
};
