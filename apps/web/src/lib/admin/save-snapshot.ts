import type { SubmitFunction } from '$app/forms';

/** Mark only the submitted snapshot as saved, preserving edits made in flight. */
export const saveSnapshot = (
  read: () => string,
  saved: (value: string) => void,
): SubmitFunction => {
  return () => {
    const sent = read();
    return async ({ result, update }) => {
      if (result.type === 'success') saved(sent);
      await update({ reset: false });
    };
  };
};
