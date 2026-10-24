// Building blocks shared by the in-memory adapters.

/** The given `slugs` that a row already uses. */
export const takenSlugs = (
  rows: Iterable<{ slug: string }>,
  slugs: readonly string[],
) =>
  new Set(
    [...rows].map((row) => row.slug).filter((slug) => slugs.includes(slug)),
  );

/** Runs tasks one at a time, like a database write lock; a failed task does not block the next. */
export const writeQueue = () => {
  let writing: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = writing.then(task, task);
    writing = run.catch(() => undefined);
    return run;
  };
};
