import { authApi } from '#lib/server/api.js';
import type { Capability } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'users.manage');
  return {
    users: await adminFor(event).users.list(),
    roles: await adminFor(event).roles.list(),
    membership: await authApi(event.fetch).membership(),
  };
};

export const actions: Actions = {
  role: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).roles.save({
        key: text(form, 'key'),
        name: text(form, 'name'),
        capabilities: form.getAll('capability') as Capability[],
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  membership: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).membership(form.has('enabled'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  create: async (event) => {
    requireCapability(event.locals, 'users.manage');
    const form = await event.request.formData();
    const password = text(form, 'password');
    const values = {
      email: text(form, 'email'),
      name: text(form, 'name'),
      role: text(form, 'role'),
    };
    try {
      await adminFor(event).users.create({
        ...values,
        password: password || undefined,
      });
    } catch (caught) {
      return failFrom(caught, { values });
    }
    return { notice: 'created' };
  },
};
