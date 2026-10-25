import { formIssuesSchema } from '@cms/sdk';
import type { AdminMedia, IssueParams } from '@cms/sdk';
import { MEDIA_FILENAME_HEADER } from '@cms/sdk/media-headers';
import { Errors } from '#lib/errors.js';

/** The values of a refusal's own issue (empty path, same message), when it has them. */
const ownParams = (message: string | undefined, issues: unknown) => {
  const parsed = formIssuesSchema.safeParse(issues);
  return parsed.success
    ? parsed.data.find(
        (issue) => issue.path === '' && issue.message === message,
      )?.params
    : undefined;
};

/**
 * Uploads one file through the admin endpoint; resolves to the stored media or an error message
 * (with the values it leaves out). XHR rather than fetch: only XHR reports upload progress
 * (`onprogress` gets 0–1).
 */
export const uploadFile = (
  file: File,
  onprogress?: (fraction: number) => void,
): Promise<{ media: AdminMedia } | { error: string; params?: IssueParams }> =>
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
      const body = request.response as
        AdminMedia | { message?: string; issues?: unknown } | null;
      if (request.status === 201 && body && 'id' in body)
        return done({ media: body });
      const refusal = body as { message?: string; issues?: unknown } | null;
      const params = ownParams(refusal?.message, refusal?.issues);
      done({
        error: refusal?.message ?? String(request.status),
        ...(params && { params }),
      });
    };
    request.onerror = () => done({ error: Errors.UploadNetwork });
    request.send(file);
  });
