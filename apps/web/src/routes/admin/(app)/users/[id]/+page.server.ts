import { error, redirect } from '@sveltejs/kit';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'users.manage');
  const users = await adminFor(event).users.list();
  const target = users.find((user) => user.id === event.params.id);
  if (!target) error(404, Errors.NotFound);
  return {
    target,
    roles: await adminFor(event).roles.list(),
    others: users
      .filter((user) => user.id !== target.id)
      .map(({ id, name }) => ({ id, name })),
  };
};

export const actions: Actions = {
  /** Emails the user a reset link through the administrator endpoint. */
  reset: async (event) => {
    requireCapability(event.locals, 'users.manage');
    try {
      await adminFor(event).users.sendPasswordReset(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'usersResetSent' };
  },
  /** Ends every session of the user; their API tokens keep working. */
  signOut: async (event) => {
    requireCapability(event.locals, 'users.manage');
    try {
      await adminFor(event).users.signOutEverywhere(event.params.id);
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'usersSignedOut' };
  },
  save: async (event) => {
    requireCapability(event.locals, 'users.manage');
    const form = await event.request.formData();
    try {
      await adminFor(event).users.update(event.params.id, {
        email: text(form, 'email'),
        name: text(form, 'name'),
        role: text(form, 'role'),
        slug: text(form, 'slug'),
        bio: text(form, 'bio'),
      });
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  delete: async (event) => {
    requireCapability(event.locals, 'users.manage');
    const form = await event.request.formData();
    const reassignTo = text(form, 'reassignTo');
    try {
      await adminFor(event).users.remove(
        event.params.id,
        reassignTo || undefined,
      );
    } catch (caught) {
      return failFrom(caught);
    }
    redirect(303, '/admin/users?notice=deleted');
  },
};
