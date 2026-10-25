import { contentApi } from '#lib/server/api.js';
import { allowCaptcha } from '#lib/server/captcha.js';
import {
  PUBLIC_FLOWS,
  cancelStep,
  chooseFactor,
  continueStep,
} from '#lib/server/sign-in.js';
import { stepView } from '#lib/server/sign-in-view.js';
import { readPending } from '#lib/server/sso-cookie.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * The step runner of sign-ins and emailed-link setups: shows the pending step from the
 * httpOnly cookie (never its transaction) and answers it. Without one, the visitor starts over.
 */
export const load: PageServerLoad = async ({
  cookies,
  url,
  fetch,
  setHeaders,
  locals,
}) => {
  setHeaders({ 'cache-control': 'private, no-store' });
  const pending = readPending(cookies, url);
  const step =
    pending?.step && PUBLIC_FLOWS.includes(pending.flow)
      ? stepView(pending.step, pending.owner)
      : null;
  return {
    step,
    flow: pending?.flow === 'setup' ? ('setup' as const) : ('login' as const),
    captcha: step
      ? allowCaptcha({ locals }, await contentApi(fetch).captcha())
      : null,
  };
};

export const actions: Actions = {
  continue: (event) => continueStep(event, PUBLIC_FLOWS),
  factor: (event) => chooseFactor(event, PUBLIC_FLOWS),
  cancel: (event) => cancelStep(event),
};
