import { failFrom } from '#lib/server/errors.js';

/**
 * Runs one form action's API call (a save, a test email, a plugin command…) and returns its
 * notice; an API refusal becomes the form failure. Catches only the call, leaving form reads
 * and prerequisite loads to the route.
 */
export const submitAction = async (
  call: () => Promise<unknown>,
  notice = 'saved',
) => {
  try {
    await call();
  } catch (caught) {
    return failFrom(caught);
  }
  return { notice };
};
