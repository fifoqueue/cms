import { redirect } from '@sveltejs/kit';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { ContentUnlocked } from '@cms/sdk';

const PREFIX = 'cms_unlock_';
/** Content ids are UUIDs; anything else in a cookie name is ignored. */
const ID = /^[0-9a-f-]{36}$/;

/** The visitor's unlock proofs (`<id>.<token>`) from their cookies. */
export const unlockProofs = (cookies: Cookies) =>
  cookies
    .getAll()
    .filter(({ name }) => name.startsWith(PREFIX))
    .map(({ name, value }) => [name.slice(PREFIX.length), value] as const)
    .filter(([id]) => ID.test(id))
    .slice(0, 20)
    .map(([id, value]) => `${id}.${value}`);

/** Keeps the proof that the visitor entered entry `id`'s password. */
export const rememberUnlock = (
  cookies: Cookies,
  id: string,
  unlocked: ContentUnlocked,
) =>
  cookies.set(`${PREFIX}${id}`, unlocked.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(unlocked.expiresAt),
  });

/** Form action checking a protected entry's password; the proof lives in an httpOnly cookie. */
export const unlockAction = async ({
  fetch,
  request,
  cookies,
  url,
  getClientAddress,
}: RequestEvent) => {
  const form = await request.formData();
  const id = text(form, 'id');
  try {
    rememberUnlock(
      cookies,
      id,
      await contentApi(fetch).unlock(
        id,
        text(form, 'password'),
        visitorOf({ getClientAddress }, form),
      ),
    );
  } catch (caught) {
    return failFrom(caught);
  }
  redirect(303, url.pathname);
};
