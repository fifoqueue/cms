import { fail } from '@sveltejs/kit';
import { CmsApiError } from '@cms/sdk/client';
import { functionsInputSchema } from '@cms/sdk/functions';
import { Errors, failFrom, issuesOf, text } from '#lib/server/errors.js';
import type { FormFailure } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

type FunctionsStatus = Awaited<
  ReturnType<ReturnType<typeof adminFor>['functions']['status']>
>;

const statusOf = (status: FunctionsStatus) => ({
  editorEnabled: status.editorEnabled,
  checkedAt: status.checkedAt,
  sources: status.sources.map(
    ({ owner, observedHash, loadedHash, lastError, updatedAt }) => ({
      owner,
      observedHash,
      loadedHash,
      lastError,
      updatedAt,
    }),
  ),
});

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'functions.edit');
  const admin = adminFor(event);
  const status = statusOf(await admin.functions.status());
  // The gate may close between the two reads; the screen then shows the status only.
  const source = status.editorEnabled
    ? await admin.functions
        .read()
        .then((file) => file.source)
        .catch((caught: unknown) => {
          if (caught instanceof CmsApiError && caught.status === 403)
            return null;
          throw caught;
        })
    : null;

  return { status: { ...status, editorEnabled: source !== null }, source };
};

/** The submitted source after the size check; a failure echoes the source back to the editor. */
const readSource = async (event: RequestEvent) => {
  const source = text(await event.request.formData(), 'source');
  const parsed = functionsInputSchema.safeParse({ source });

  return parsed.success
    ? { source }
    : {
        source,
        failure: fail(400, {
          source,
          message: Errors.FormInvalid,
          code: 'invalid_input',
          issues: issuesOf(parsed.error.issues),
        } satisfies FormFailure & { source: string }),
      };
};

export const actions: Actions = {
  validate: async (event) => {
    requireCapability(event.locals, 'functions.edit');
    const { source, failure } = await readSource(event);

    if (failure) return failure;

    try {
      await adminFor(event).functions.validate(source);
    } catch (caught) {
      return failFrom(caught, { source });
    }

    return { notice: 'functionsValid', source };
  },
  save: async (event) => {
    requireCapability(event.locals, 'functions.edit');
    const { source, failure } = await readSource(event);

    if (failure) return failure;

    try {
      const status = statusOf(await adminFor(event).functions.write(source));

      return { notice: 'functionsSaved', source, status };
    } catch (caught) {
      return failFrom(caught, { source });
    }
  },
};
