import { MEDIA_TYPES } from '@cms/sdk';
import { restParams } from '#api/http/params';
import { errorResponse } from '#api/http/respond';
import type { ApiApp } from '#api/http/services';
import { Errors } from '#api/shared/errors';

const TYPES = Object.fromEntries(
  Object.entries(MEDIA_TYPES).map(([mime, extension]) => [extension, mime]),
) as Record<string, string>;

/** `bytes=start-end` (one range); anything else is served whole. */
const rangeOf = (header: string | null) => {
  const match = header && /^bytes=(\d+)-(\d*)$/.exec(header);
  return match
    ? { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined }
    : undefined;
};

/** Uploaded files. Keys are unique per upload, so responses are cached for good. */
export const routes = (app: ApiApp) =>
  app.get(
    '',
    async ({ media, params, request }) => {
      const key = params['*'] ?? '';
      const range = rangeOf(request.headers.get('range'));
      const file = await media.file(key, range);
      if (!file) return errorResponse(404, 'not_found', Errors.MediaNotFound);
      const extension = key.slice(key.lastIndexOf('.') + 1);
      const headers = new Headers({
        'content-type': TYPES[extension] ?? 'application/octet-stream',
        'content-length': String(file.end - file.start + 1),
        'cache-control': 'public, max-age=31536000, immutable',
        'accept-ranges': 'bytes',
        'x-content-type-options': 'nosniff',
        // Files are shown, never run: no scripts even if a viewer were tricked into it.
        'content-security-policy':
          extension === 'svg'
            ? "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
            : "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      });
      if (extension === 'svg')
        headers.set('content-disposition', 'attachment; filename="image.svg"');
      if (!range) return new Response(file.body, { headers });
      headers.set(
        'content-range',
        `bytes ${file.start}-${file.end}/${file.size}`,
      );
      return new Response(file.body, { status: 206, headers });
    },
    { parse: 'none', ...restParams },
  );
