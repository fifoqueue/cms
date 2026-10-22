import {
  CAPTCHA_MODES,
  CAPTCHA_PROVIDERS,
  PROTECTED_ACTIONS,
  RATE_RULES,
} from '@cms/sdk';
import type {
  CaptchaMode,
  CaptchaProvider,
  RateRule,
  SecuritySettingsInput,
} from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const pick = <T extends string>(
  options: readonly T[],
  value: string,
  fallback: T,
) => ((options as readonly string[]).includes(value) ? (value as T) : fallback);

const integer = (form: FormData, key: string) =>
  Math.trunc(Number(text(form, key)));

export const load: PageServerLoad = async (event) => ({
  security: await adminFor(event).security.settings(),
});

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const secret = text(form, 'secretKey');
    const input: SecuritySettingsInput = {
      captcha: {
        provider: pick<CaptchaProvider>(
          CAPTCHA_PROVIDERS,
          text(form, 'provider'),
          'none',
        ),
        siteKey: text(form, 'siteKey'),
        minimumScore: Number(text(form, 'minimumScore')) || 0,
        // Empty keeps the stored secret unless removal was asked for.
        secretKey: form.has('removeSecret') ? '' : secret || undefined,
        modes: Object.fromEntries(
          PROTECTED_ACTIONS.map((action) => [
            action,
            pick<CaptchaMode>(
              CAPTCHA_MODES,
              text(form, `mode.${action}`),
              'limited',
            ),
          ]),
        ) as SecuritySettingsInput['captcha']['modes'],
      },
      rules: Object.fromEntries(
        RATE_RULES.map((name) => [
          name,
          {
            enabled: form.has(`${name}.enabled`),
            max: integer(form, `${name}.max`),
            windowSeconds: integer(form, `${name}.windowSeconds`),
            blockSeconds: integer(form, `${name}.blockSeconds`),
            enforcement: pick<RateRule['enforcement']>(
              ['block', 'captcha'],
              text(form, `${name}.enforcement`),
              'block',
            ),
          } satisfies RateRule,
        ]),
      ) as SecuritySettingsInput['rules'],
    };
    try {
      await adminFor(event).security.update(input);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
};
