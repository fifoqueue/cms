import { pageSchema } from '#sdk/transport';
import type { ClientOptions, Query, Request } from '#sdk/transport';
import {
  MEDIA_FILENAME_HEADER,
  adminMediaSchema,
  mediaContextSchema,
} from '#sdk/media';
import type {
  AdminMedia,
  ImageEditInput,
  MediaContext,
  MediaListQuery,
  MediaUpdateInput,
} from '#sdk/media';
import type { Paginated } from '#sdk/common';

/** The media library (`media.upload`; changing others' files needs `media.manage`). */
export const mediaAdminClient = (request: Request) => {
  const path = (id: string) => `/api/v1/admin/media/${encodeURIComponent(id)}`;
  return {
    list: (query: MediaListQuery = {}) =>
      request<Paginated<AdminMedia>>('GET', '/api/v1/admin/media', {
        query: query as Query,
        response: pageSchema(adminMediaSchema),
      }),
    get: (id: string) =>
      request<AdminMedia>('GET', path(id), { response: adminMediaSchema }),
    /** Neighbouring files and the entries that show this one. */
    context: (id: string) =>
      request<MediaContext>('GET', `${path(id)}/context`, {
        response: mediaContextSchema,
      }),
    /** Sends the raw file; the API decides its type from the bytes. */
    upload: (file: BodyInit, filename: string) =>
      request<AdminMedia>('POST', '/api/v1/admin/media', {
        body: file,
        contentType: 'application/octet-stream',
        headers: { [MEDIA_FILENAME_HEADER]: encodeURIComponent(filename) },
        response: adminMediaSchema,
      }),
    edit: (id: string, input: ImageEditInput) =>
      request<AdminMedia>('POST', `${path(id)}/edit`, {
        json: input,
        response: adminMediaSchema,
      }),
    update: (id: string, input: MediaUpdateInput) =>
      request<AdminMedia>('PUT', path(id), {
        json: input,
        response: adminMediaSchema,
      }),
    /** `force` also removes a file that entries still show. */
    remove: (id: string, force = false) =>
      request<void>('DELETE', path(id), {
        query: { force: force ? '1' : undefined },
      }),
  };
};

/**
 * Serves uploaded files through a frontend: the API's response passes through unparsed, with
 * its status (200, 206 or 404) and headers. `range` is the browser's `Range` header.
 */
export const createMediaClient = ({
  baseUrl,
  fetch: fetcher = fetch,
}: ClientOptions) => ({
  file: (key: string, range?: string | null) =>
    fetcher(
      `${baseUrl}/api/v1/media/files/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      { headers: range ? { range } : {} },
    ),
});
