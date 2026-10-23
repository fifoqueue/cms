const MINIMUM_MS = 500;

const systemTiming = {
  now: () => performance.now(),
  wait: (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
};

/** Keeps public account lookups from exposing the shorter unknown/existing branch. */
export const obscureAccountLookup = async <T>(
  task: () => Promise<T>,
  timing = systemTiming,
): Promise<T> => {
  const started = timing.now();
  try {
    return await task();
  } finally {
    const remaining = MINIMUM_MS - (timing.now() - started);
    if (remaining > 0) await timing.wait(remaining);
  }
};
