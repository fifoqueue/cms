import type { AdminMedia } from '@cms/sdk';
import { MEDIA_FILENAME_HEADER } from '@cms/sdk/media-headers';

/** Uploads one file through the admin endpoint; resolves to the stored media or an error message. */
export const uploadFile = async (
  file: File,
): Promise<{ media: AdminMedia } | { error: string }> => {
  const response = await fetch('/admin/media/upload', {
    method: 'POST',
    headers: { [MEDIA_FILENAME_HEADER]: encodeURIComponent(file.name) },
    body: file,
  }).catch(() => null);
  if (!response) return { error: 'Network error' };
  const body = (await response.json().catch(() => null)) as
    AdminMedia | { message?: string } | null;
  return response.ok && body && 'id' in body
    ? { media: body }
    : {
        error:
          (body as { message?: string } | null)?.message ??
          String(response.status),
      };
};
