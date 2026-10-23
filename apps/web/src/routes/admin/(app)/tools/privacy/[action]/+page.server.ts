import { error } from '@sveltejs/kit';
import { adminFor, requireCapability } from '#lib/server/session.js';
import { contentApi } from '#lib/server/api.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';
const actionOf = (value: string) => {
  if (value !== 'export' && value !== 'erase') error(404, Errors.NotFound);
  return value;
};
export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'users.manage');
  event.setHeaders({ 'cache-control': 'private, no-store' });
  const action = actionOf(event.params.action);
  const requests = await adminFor(event).privacy.list(
    action,
    Math.max(
      1,
      Math.min(
        10000,
        Math.trunc(Number(event.url.searchParams.get('page'))) || 1,
      ),
    ),
  );
  return { action, requests, captcha: await contentApi(event.fetch).captcha() };
};
export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).privacy.create(
        text(form, 'email'),
        actionOf(event.params.action),
        visitorOf(event, form),
      );
    } catch (error) {
      return failFrom(error);
    }
    return { notice: 'privacySent' };
  },
  erase: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).privacy.erase(text(form, 'id'));
    } catch (error) {
      return failFrom(error);
    }
    return { notice: 'privacyErased' };
  },
};
