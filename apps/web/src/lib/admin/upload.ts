import type { AdminMedia } from '@cms/sdk';
import { MEDIA_FILENAME_HEADER } from '@cms/sdk/media-headers';

/**
 * Uploads one file through the admin endpoint; resolves to the stored media or an error message.
 * XHR rather than fetch: only XHR reports upload progress (`onprogress` gets 0–1).
 */
export const uploadFile = (
  file: File,
  onprogress?: (fraction: number) => void,
): Promise<{ media: AdminMedia } | { error: string }> =>
  new Promise((done) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/admin/media/upload');
    request.setRequestHeader(
      MEDIA_FILENAME_HEADER,
      encodeURIComponent(file.name),
    );
    request.responseType = 'json';
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onprogress?.(event.loaded / event.total);
    };
    request.onload = () => {
      const body = request.response as AdminMedia | { message?: string } | null;
      done(
        request.status === 201 && body && 'id' in body
          ? { media: body }
          : {
              error:
                (body as { message?: string } | null)?.message ??
                String(request.status),
            },
      );
    };
    request.onerror = () => done({ error: 'Network error' });
    request.send(file);
  });
