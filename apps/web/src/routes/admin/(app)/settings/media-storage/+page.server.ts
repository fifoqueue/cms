import { fail } from '@sveltejs/kit';
import { mediaStorageInputSchema } from '@cms/sdk';
import type { MediaStorageInput } from '@cms/sdk';
import { Errors, failFrom, issuesOf } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import {
  readMediaStorageForm,
  storageFormValues,
} from '#lib/admin/settings/media-storage-form.server.js';
import type { MediaStorageFormValues } from '#lib/admin/settings/media-storage-form.server.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
  const storage = await adminFor(event).media.storage.get();
  return { storage, values: storageFormValues(storage) };
};

/**
 * Reads and checks the form, then hands its input to `call`. The API probes the storage first
 * and refuses a failed probe with its reason (`invalid_input`, or `destination_blocked`).
 */
const attempt = async (
  event: RequestEvent,
  call: (input: MediaStorageInput) => Promise<unknown>,
) => {
  const form = await event.request.formData();
  // The declared fields of the chosen plugin driver decide how its values are read.
  const { availableDrivers } = await adminFor(event).media.storage.get();
  const { values, input } = readMediaStorageForm(form, availableDrivers);
  const result = mediaStorageInputSchema.safeParse(input);
  if (!result.success)
    return {
      values,
      failure: fail(400, {
        values,
        message: Errors.FormInvalid,
        code: 'invalid_input',
        issues: issuesOf(result.error.issues),
      } satisfies FormFailure & { values: MediaStorageFormValues }),
    };
  try {
    await call(result.data);
  } catch (caught) {
    return { values, failure: failFrom(caught, { values }) };
  }
  return { values, failure: null };
};

export const actions: Actions = {
  save: async (event) => {
    const { failure } = await attempt(event, (input) =>
      adminFor(event).media.storage.update(input),
    );
    return failure ?? { notice: 'saved' };
  },
  /** Probes without saving; what was typed stays in the form. */
  test: async (event) => {
    const { values, failure } = await attempt(event, (input) =>
      adminFor(event).media.storage.test(input),
    );
    return failure ?? { values, notice: 'mediaStorageTested' };
  },
};
