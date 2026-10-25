import { z } from 'zod';
import { Errors } from '#api/shared/errors';

/** JSON persisted with a pending sign-in, never sent to the browser. */
export const signInStateSchema = z.json().superRefine((value, context) => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8192) {
    context.addIssue({ code: 'custom', message: Errors.SignInStateTooLarge });
  }
});
