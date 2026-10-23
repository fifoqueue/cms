import { redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { privacyProofsSchema } from '@cms/sdk';
import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

const requestId = (value: string) =>
  /^[0-9a-f-]{36}$/i.test(value) ? value : '';
const cookie = (url: URL) =>
  `${url.protocol === 'https:' ? '__Host-' : ''}cms_privacy_confirmations`;
const proofsOf = (cookies: Cookies, url: URL) => {
  try {
    const parsed = privacyProofsSchema.safeParse(
      JSON.parse(cookies.get(cookie(url)) ?? '[]'),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};
const saveProofs = (
  cookies: Cookies,
  url: URL,
  proofs: { id: string; token: string }[],
) => {
  const options = { path: '/', secure: url.protocol === 'https:' };
  if (proofs.length)
    cookies.set(cookie(url), JSON.stringify(proofs.slice(-5)), {
      ...options,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 2 * 86400,
    });
  else cookies.delete(cookie(url), options);
};

/** Confirmation is a standalone consent page; bearer proofs never enter its page data. */
export const load: PageServerLoad = async ({
  url,
  cookies,
  fetch,
  setHeaders,
}) => {
  setHeaders({
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
  });
  const token = url.searchParams.get('token');
  if (token !== null) {
    const id = requestId(token.split('.')[0] ?? '');
    const parsed = privacyProofsSchema.safeParse([{ id, token }]);
    if (!parsed.success) redirect(303, '/privacy/confirm');
    saveProofs(cookies, url, [
      ...proofsOf(cookies, url).filter((proof) => proof.id !== id),
      ...parsed.data,
    ]);
    redirect(303, `/privacy/confirm?request=${id}`);
  }
  const api = contentApi(fetch);
  const [site, captcha, privacy] = await Promise.all([
    api.site(),
    api.captcha(),
    api.privacy(),
  ]);
  return {
    requestId: requestId(url.searchParams.get('request') ?? ''),
    language: site.locale,
    captcha,
    privacyPolicy: privacy.policy,
  };
};

export const actions: Actions = {
  confirm: async (event) => {
    event.setHeaders({ 'cache-control': 'private, no-store' });
    const form = await event.request.formData();
    const id = requestId(text(form, 'requestId'));
    const proofs = proofsOf(event.cookies, event.url);
    try {
      await contentApi(event.fetch).confirmPrivacy(
        proofs.find((proof) => proof.id === id)?.token ?? '',
        visitorOf(event, form),
      );
    } catch (error) {
      return failFrom(error);
    }
    saveProofs(
      event.cookies,
      event.url,
      proofs.filter((proof) => proof.id !== id),
    );
    return { notice: 'privacyConfirmed' };
  },
};
