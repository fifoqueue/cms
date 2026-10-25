import { passwordResetSchema } from '@cms/sdk';
import { authApi, contentApi } from '#lib/server/api.js';
import { allowCaptcha } from '#lib/server/captcha.js';
import { setupStep } from '#lib/server/sign-in.js';
import { methodView } from '#lib/server/sign-in-view.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Reset and invitation links land here and offer every method that can set up the account
 * (choosing a password is one of them), the same way for core and plugin methods. The token
 * from the emailed link travels in the forms, never in page data beyond this page; a malformed
 * one asks for a new link instead.
 */
export const load: PageServerLoad = async (event) => {
  const { url, setHeaders, fetch } = event;
  // The link holds a secret: keep it out of caches and referrers.
  setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  const token = url.searchParams.get('token') ?? '';
  // Emailed links carry password tokens, whichever method they set up.
  const linkValid = passwordResetSchema.shape.token.safeParse(token).success;
  // Without a usable link there is nothing to offer; an unreachable API shows a notice.
  const [info, captcha] = linkValid
    ? await Promise.all([
        authApi(fetch)
          .signIn.info()
          .catch(() => null),
        contentApi(fetch)
          .captcha()
          .catch(() => null),
      ])
    : [null, null];
  return {
    token,
    linkValid,
    methods: info ? info.setup.map(methodView) : [],
    unavailable: linkValid && !info,
    passwordReset: info?.passwordReset ?? false,
    captcha: allowCaptcha(event, captcha),
  };
};

export const actions: Actions = {
  setup: async (event) => setupStep(event, await event.request.formData()),
};
