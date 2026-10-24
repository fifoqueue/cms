/** Serializes lifecycle changes without letting one rejection poison later work. */
export const serialQueue = () => {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };
};
