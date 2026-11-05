import { createHash } from 'node:crypto';

/** Representation observations are bounded and never retain response bodies. */
const observations = new Map<string, { etag: string; modified: string }>();
const LIMIT = 512;

/** Validators describe the complete rendered document, including theme and plugin output. */
export const revalidateHtml = async (
  request: Request,
  response: Response,
  seconds: number,
) => {
  const body = await response.text();
  const etag = `W/"${createHash('sha256').update(body).digest('hex')}"`;
  const previous = observations.get(request.url);
  const modified =
    previous?.etag === etag ? previous.modified : new Date().toUTCString();

  observations.delete(request.url);
  observations.set(request.url, { etag, modified });
  if (observations.size > LIMIT)
    observations.delete(observations.keys().next().value!);
  const headers = new Headers(response.headers);

  headers.set('etag', etag);
  headers.set('last-modified', modified);
  headers.set(
    'cache-control',
    seconds
      ? `public, max-age=0, s-maxage=${seconds}, must-revalidate`
      : 'public, max-age=0, must-revalidate',
  );
  headers.delete('content-length');
  const validators = request.headers.get('if-none-match');
  const unchanged = validators
    ?.split(',')
    .some(
      (value) =>
        value.trim() === '*' ||
        value.trim().replace(/^W\//, '') === etag.slice(2),
    );

  // A template has no authoritative modification date; date-only conditions require a body.
  return new Response(unchanged || request.method === 'HEAD' ? null : body, {
    status: unchanged ? 304 : response.status,
    headers,
  });
};
