/**
 * An API file response passed on to the browser with only the `passed` headers; API errors
 * become an empty 404 (missing) or 502. `status` defaults to 200.
 */
export const relayFile = (
  response: Response,
  passed: readonly string[],
  status?: number,
) => {
  const headers = new Headers();
  for (const name of passed) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!response.ok)
    return new Response(null, { status: response.status === 404 ? 404 : 502 });
  return new Response(response.body, { status, headers });
};
