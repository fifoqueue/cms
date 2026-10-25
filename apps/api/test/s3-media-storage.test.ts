import { expect, test } from 'bun:test';
import { S3MediaStorage } from '#api/infra/s3-media-storage';
import { EgressPolicy } from '#api/infra/egress-policy';
import { Errors } from '@cms/sdk/errors';
import { StorageSettings } from '#api/domain/media/storage-settings';

const configuration = {
  endpoint: 'https://storage.example',
  region: 'us-east-1',
  bucket: 'media',
  accessKeyId: 'access',
  secretAccessKey: 'secret',
  secretAccessKeyConfigured: true,
  forcePathStyle: true,
  prefix: 'uploads/',
};

test('failed candidate probe deletion reports its fixed location without retaining credentials or tombstones', async () => {
  const values = new Map<string, unknown>();
  const store = {
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    list: async () => Object.fromEntries(values),
    count: async () => values.size,
  };
  const paths: string[] = [];
  const settings = new StorageSettings({
    settings: store,
    transactions: { run: async (_lock, task) => task(store) },
    secrets: {
      seal: (value) => `sealed:${value}`,
      open: (value) => value.slice(7),
    },
    test: async ({ s3 }) => {
      if (!s3) throw new Error('expected S3');
      await new S3MediaStorage(s3, async (input) => {
        const request = input as Request;
        paths.push(`${request.method} ${new URL(request.url).pathname}`);
        return new Response(null, {
          status: request.method === 'DELETE' ? 503 : 200,
        });
      }).test();
    },
  });
  for (const [bucket, prefix] of [
    ['first', 'uploads/'],
    ['changed', 'candidate/'],
  ]) {
    await expect(
      settings.update({
        driver: 's3',
        s3: {
          ...configuration,
          bucket,
          prefix,
          secretAccessKey: 'CANDIDATE_SECRET',
        },
      }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      message: Errors.MediaStorageProbeCleanup,
      issues: [
        {
          path: 'probe',
          message: Errors.MediaStorageProbeCleanup,
          params: { bucket, key: `${prefix}.cms-probe` },
        },
      ],
    });
  }
  expect(paths).toEqual([
    'PUT /first/uploads/.cms-probe',
    'DELETE /first/uploads/.cms-probe',
    'PUT /changed/candidate/.cms-probe',
    'DELETE /changed/candidate/.cms-probe',
  ]);
  expect((await settings.get()).driver).toBe('local');
  expect(
    [...values.keys()].some((key) => key.startsWith('media.cleanup.')),
  ).toBe(false);
  expect(JSON.stringify([...values])).not.toContain('CANDIDATE_SECRET');
});

test('probe failures expose safe 400 reason classes, never provider bodies or network details', async () => {
  for (const [status, message] of [
    [401, Errors.MediaStorageProbeAuth],
    [403, Errors.MediaStorageProbeAuth],
    [404, Errors.MediaStorageProbeBucket],
    [503, Errors.MediaStorageProbeRejected],
  ] as const) {
    const storage = new S3MediaStorage(
      configuration,
      async () => new Response('SECRET provider body', { status }),
    );
    await expect(storage.test('probe')).rejects.toMatchObject({
      code: 'invalid_input',
      message,
    });
  }
  for (const [code, message] of [
    ['ECONNREFUSED', Errors.MediaStorageProbeNetwork],
    ['CERT_HAS_EXPIRED', Errors.MediaStorageProbeTls],
  ]) {
    const storage = new S3MediaStorage(configuration, async () => {
      throw Object.assign(new Error('SECRET credential URL'), { code });
    });
    await expect(storage.test('probe')).rejects.toMatchObject({
      code: 'invalid_input',
      message,
    });
  }
});

test('all S3 operations enforce service-scoped DNS pinning and reject redirects', async () => {
  let address = '127.0.0.1';
  let redirect = false;
  const sent: string[] = [];
  const policy = new EgressPolicy({
    resolver: async () => [{ address, family: 4 }],
    fetcher: async (input, init) => {
      expect(new URL(String(input)).hostname).toBe(address);
      expect(new Headers(init?.headers).get('host')).toBe('storage.example');
      expect(new Headers(init?.headers).get('authorization')).toStartWith(
        'AWS4-HMAC-SHA256 ',
      );
      sent.push(init?.method ?? 'GET');
      if (redirect)
        return new Response(null, {
          status: 307,
          headers: { location: 'http://169.254.169.254/latest' },
        });
      if (new URL(String(input)).searchParams.has('list-type'))
        return new Response(
          '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>uploads/a</Key><Size>1</Size><ETag>abc</ETag></Contents></ListBucketResult>',
        );
      return new Response(init?.method === 'GET' ? 'x' : null, {
        headers: { 'content-length': '1' },
      });
    },
  });
  const blocked = new S3MediaStorage(configuration, (input, init) =>
    policy.fetch(input, init),
  );
  await expect(blocked.test('probe')).rejects.toThrow();
  await expect(
    blocked.commit([{ key: 'a', bytes: new Uint8Array([1]) }]),
  ).rejects.toThrow();
  await expect(blocked.remove(['a'])).rejects.toThrow();
  await expect(blocked.list()).rejects.toThrow();
  expect(sent).toEqual([]);
  const storage = new S3MediaStorage(configuration, (input, init) =>
    policy.fetch(input, init, {
      service: 'media-storage',
      rules: [
        {
          service: 'media-storage',
          host: 'storage.example',
          port: 443,
          addresses: ['127.0.0.1'],
        },
      ],
    }),
  );
  await storage.test('probe');
  await storage.commit([{ key: 'a', bytes: new Uint8Array([1]) }]);
  await storage.remove(['a']);
  expect((await storage.list()).contents[0]).toEqual({
    key: 'uploads/a',
    size: 1,
    eTag: 'abc',
  });
  expect(await new Response((await storage.read('a'))!.body).text()).toBe('x');
  address = '93.184.216.34';
  redirect = true;
  const before = sent.length;
  await expect(storage.list()).rejects.toThrow();
  expect(sent.length).toBe(before + 1);
});

test('S3 probes use signed PUT and DELETE, never a bucket listing', async () => {
  const requests: { method: string; path: string; authorization: string }[] =
    [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push({
        method: request.method,
        path: new URL(request.url).pathname,
        authorization: request.headers.get('authorization') ?? '',
      });
      await request.arrayBuffer();
      return new Response(null, {
        status: request.method === 'DELETE' ? 204 : 200,
      });
    },
  });
  try {
    const storage = new S3MediaStorage(
      {
        endpoint: server.url.origin,
        region: 'us-east-1',
        bucket: 'media',
        accessKeyId: 'access',
        secretAccessKey: 'secret',
        secretAccessKeyConfigured: true,
        forcePathStyle: true,
        prefix: 'uploads/',
      },
      (input, init) =>
        new EgressPolicy().fetch(input, init, {
          service: 'media-storage',
          rules: [
            {
              service: 'media-storage',
              host: '127.0.0.1',
              port: server.port!,
              addresses: ['127.0.0.1'],
            },
          ],
        }),
    );
    await storage.test('probe');
    expect(requests.map(({ method }) => method)).toEqual(['PUT', 'DELETE']);
    for (const request of requests) {
      expect(request.path).toBe('/media/uploads/.cms-probe');
      expect(request.authorization).toStartWith('AWS4-HMAC-SHA256 ');
      expect(request.authorization).toContain('/us-east-1/s3/aws4_request');
    }
  } finally {
    await server.stop(true);
  }
});
