type QueryValue = string | number | undefined;

/** A list screen's query string: `current` with `changes` applied; undefined values are left out. */
export const listQuery = (
  current: Record<string, QueryValue>,
  changes: Record<string, QueryValue>,
): `?${string}` => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes }))
    if (value !== undefined) params.set(key, String(value));
  return `?${params}`;
};
