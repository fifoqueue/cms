/** API requests one server response keeps in flight at most. */
export const CONCURRENCY = 4;

/** `task` over `items` in order, with at most `limit` running at once. */
export const mapLimit = async <T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>,
  limit = CONCURRENCY,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};
