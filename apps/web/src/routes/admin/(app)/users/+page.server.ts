import { fail } from '@sveltejs/kit';
import { authApi } from '#lib/server/api.js';
import type { Capability } from '@cms/sdk';
import { eachBounded, formIds } from '#lib/server/bulk.js';
import { Errors, failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'users.manage');
  const admin = adminFor(event);
  const [users, roles, membership] = await Promise.all([
    admin.users.list(),
    admin.roles.list(),
    authApi(event.fetch).membership(),
  ]);
  const params = event.url.searchParams;
  // Only existing roles filter; anything else lists everyone.
  const role = roles.find(({ key }) => key === params.get('role'))?.key;
  const search = (params.get('q') ?? '').trim().slice(0, 200).toLowerCase();
  const counts: Record<string, number> = {};
  for (const user of users) counts[user.role] = (counts[user.role] ?? 0) + 1;
  return {
    users: users.filter(
      (user) =>
        (!role || user.role === role) &&
        (!search ||
          [user.name, user.email, user.slug].some((value) =>
            value.toLowerCase().includes(search),
          )),
    ),
    total: users.length,
    counts,
    filter: { role, q: search || undefined },
    // Everyone else, for reassigning the content of deleted users.
    everyone: users.map(({ id, name }) => ({ id, name })),
    roles,
    membership,
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
    // An invitation lets the user choose their own password; otherwise one is set here.
    const invite = form.has('invite');
    const password = invite ? '' : text(form, 'password');
    const values = {
      email: text(form, 'email'),
      name: text(form, 'name'),
      role: text(form, 'role'),
      invite,
    };
    if (!invite && !password)
      return fail(400, { values, message: Errors.PasswordOrInvite });
    try {
      await adminFor(event).users.create({
        email: values.email,
        name: values.name,
        role: values.role,
        password: password || undefined,
      });
    } catch (caught) {
      return failFrom(caught, { values });
    }
    return { notice: 'created' };
  },
  /** Emails a password reset link through the administrator endpoint (limited per administrator). */
  reset: async (event) => {
    requireCapability(event.locals, 'users.manage');
    const form = await event.request.formData();
    try {
      await adminFor(event).users.sendPasswordReset(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'usersResetSent' };
  },
  /** Deletes a custom role after moving its users to another role. */
  deleteRole: async (event) => {
    requireCapability(event.locals, 'users.manage');
    const form = await event.request.formData();
    try {
      await adminFor(event).roles.remove(
        text(form, 'key'),
        text(form, 'reassignTo'),
      );
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },
  /** Changes the role of, or deletes, every selected user except the signed-in one. */
  bulk: async (event) => {
    requireCapability(event.locals, 'users.manage');
    const form = await event.request.formData();
    const self = event.locals.user!.id;
    const ids = formIds(form).filter((id) => id !== self);
    const action = text(form, 'action');
    const admin = adminFor(event);
    if (!ids.length) return {};
    if (action === 'delete') {
      const reassignTo = text(form, 'reassignTo') || undefined;
      if (reassignTo && ids.includes(reassignTo))
        return fail(400, { message: Errors.ReassignToDeleted });
      return {
        bulk: await eachBounded(ids, (id) =>
          admin.users.remove(id, reassignTo),
        ),
      };
    }
    const role = text(form, 'role');
    if (action !== 'role' || !role) return {};
    const users = new Map(
      (await admin.users.list()).map((user) => [user.id, user]),
    );
    return {
      bulk: await eachBounded(ids, async (id) => {
        const user = users.get(id);
        if (!user) return Errors.NotFound;
        await admin.users.update(id, {
          email: user.email,
          name: user.name,
          slug: user.slug,
          bio: user.bio,
          role,
        });
      }),
    };
  },
};
