import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { readProfileFields } from '#lib/admin/plugin-profile-fields.js';
import { Errors, failFrom } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';

type Event = Pick<RequestEvent, 'fetch' | 'locals' | 'request'>;

/** Plugin profile fields of a user (own account, or anyone's with `users.manage`). */
export const profileFieldsOf = (
  event: Pick<RequestEvent, 'fetch' | 'locals'>,
  id: string,
) => adminFor(event).users.profileFields(id);

/**
 * Saves the posted plugin profile fields. Refusals carry `profileFields: true` (their issues
 * belong next to the fields) and what was typed, which is this user's own data.
 */
export const saveProfileFields = async (event: Event, id: string) => {
  const users = adminFor(event).users;
  // The current declarations decide which posted inputs are read and how.
  const meta = await users.profileFields(id);
  const read = readProfileFields(await event.request.formData(), meta);
  const extra = { profileFields: true as const, typed: read.typed };
  if (read.invalid.length)
    return fail(400, {
      ...extra,
      message: Errors.FormInvalid,
      code: 'invalid_input',
      issues: read.invalid.map((key) => ({
        path: key,
        message: Errors.ProfileNumberInvalid,
      })),
    } satisfies FormFailure & typeof extra);
  try {
    await users.saveProfileFields(id, read.values);
  } catch (caught) {
    return failFrom(caught, extra);
  }
  return { notice: 'saved' as const };
};
