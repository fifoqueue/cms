import { expect, test } from 'bun:test';
import { S3MediaStorage } from '#api/infra/s3-media-storage';
import { EgressPolicy } from '#api/infra/egress-policy';

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
