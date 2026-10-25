import { AwsClient } from 'aws4fetch';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type { MediaStorage } from '#api/domain/media/ports';
import type { MediaStorageSettings } from '@cms/sdk';
import { Errors, DomainError, invalidInput } from '#api/shared/errors';
import { failureOf } from '#api/shared/failures';

type Configuration = NonNullable<MediaStorageSettings['s3']> & {
  secretAccessKey: string;
};
type Transport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
const listing = z.object({
  ListBucketResult: z.object({
    IsTruncated: z.enum(['true', 'false']),
    NextContinuationToken: z.string().optional(),
    Contents: z
      .array(
        z.object({
          Key: z.string(),
          Size: z.coerce.number().int().nonnegative(),
          ETag: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

/** SigV4 signing only; every socket belongs to the injected egress transport. */
export class S3MediaStorage implements MediaStorage {
  private readonly signer: AwsClient;
  constructor(
    private readonly configuration: Configuration,
    private readonly transport: Transport,
  ) {
    this.signer = new AwsClient({
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
      region: configuration.region,
      service: 's3',
      retries: 0,
    });
  }

  private url(key?: string) {
    const url = new URL(this.configuration.endpoint);
    const bucket = encodeURIComponent(this.configuration.bucket);
    if (!this.configuration.forcePathStyle)
      url.hostname = `${bucket}.${url.hostname}`;
    const root = url.pathname.replace(/\/$/, '');
    url.pathname = `${root}/${this.configuration.forcePathStyle ? `${bucket}/` : ''}${key === undefined ? '' : (this.configuration.prefix + key).split('/').map(encodeURIComponent).join('/')}`;
    return url;
  }

  private async request(url: URL, init: RequestInit = {}) {
    // An S3 region redirect is a configuration error, never permission to forward credentials.
    const request = await this.signer.sign(url, { ...init, redirect: 'error' });
    let response: Response;
    try {
      response = await this.transport(request);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'destination_blocked')
        throw error;
      throw invalidInput(
        failureOf(error)?.reason === 'tls'
          ? Errors.MediaStorageProbeTls
          : Errors.MediaStorageProbeNetwork,
      );
    }
    if (!response.ok && response.status !== 404) {
      await response.body?.cancel();
      throw invalidInput(
        response.status === 401 || response.status === 403
          ? Errors.MediaStorageProbeAuth
          : Errors.MediaStorageProbeRejected,
      );
    }
    return response;
  }

  async commit(files: readonly { key: string; bytes: Uint8Array }[]) {
    const written: string[] = [];
    try {
      for (const file of files) {
        const response = await this.request(this.url(file.key), {
          method: 'PUT',
          body: new Uint8Array(file.bytes),
        });
        if (!response.ok) throw invalidInput(Errors.MediaStorageProbeBucket);
        await response.body?.cancel();
        written.push(file.key);
      }
      return 'stored' as const;
    } catch (error) {
      await this.remove(written);
      throw error;
    }
  }

  async read(key: string, range?: { start: number; end?: number }) {
    const head = await this.request(this.url(key), { method: 'HEAD' });
    if (head.status === 404) return null;
    const size = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(head.headers.get('content-length'));
    const start = Math.min(range?.start ?? 0, Math.max(0, size - 1));
    const end = Math.min(range?.end ?? size - 1, size - 1);
    const response = await this.request(this.url(key), {
      headers: size ? { range: `bytes=${start}-${end}` } : {},
    });
    if (response.status === 404) return null;
    if (!response.body) throw new Error(Errors.MediaNotFound);
    return { body: response.body, size, start, end };
  }

  async remove(keys: readonly string[]) {
    for (const key of keys) {
      const response = await this.request(this.url(key), { method: 'DELETE' });
      await response.body?.cancel();
    }
  }

  async test(_probe?: string) {
    const probe = '.cms-probe';
    try {
      await this.commit([{ key: probe, bytes: new Uint8Array([0]) }]);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw invalidInput(Errors.MediaStorageProbeNetwork);
    }
    try {
      const response = await this.request(this.url(probe), {
        method: 'DELETE',
      });
      if (!response.ok) throw invalidInput(Errors.MediaStorageProbeBucket);
      await response.body?.cancel();
    } catch {
      throw invalidInput(Errors.MediaStorageProbeCleanup, [
        {
          path: 'probe',
          message: Errors.MediaStorageProbeCleanup,
          params: {
            bucket: this.configuration.bucket,
            key: this.configuration.prefix + probe,
          },
        },
      ]);
    }
  }

  async list(continuationToken?: string, signal?: AbortSignal) {
    const url = this.url();
    url.searchParams.set('list-type', '2');
    url.searchParams.set('max-keys', '100');
    url.searchParams.set('prefix', this.configuration.prefix);
    if (continuationToken)
      url.searchParams.set('continuation-token', continuationToken);
    const response = await this.request(url, { signal });
    if (!response.ok || !response.body)
      throw new Error(Errors.MediaResyncFailed);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 1024 * 1024) throw new Error(Errors.MediaResyncFailed);
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    const xml = await new Blob(
      chunks.map((chunk) => new Uint8Array(chunk)),
    ).text();
    const result = listing.parse(
      new XMLParser({
        parseTagValue: false,
        isArray: (name) => name === 'Contents',
        processEntities: false,
      }).parse(xml),
    ).ListBucketResult;
    return {
      contents: result.Contents.map((object) => ({
        key: object.Key,
        size: object.Size,
        eTag: object.ETag,
      })),
      isTruncated: result.IsTruncated === 'true',
      nextContinuationToken: result.NextContinuationToken,
    };
  }
}
