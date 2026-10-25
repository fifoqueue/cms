import { expect, test } from 'bun:test';
import { mediaStorageInputSchema } from '#sdk/media';

const s3 = (endpoint: string, publicBaseUrl?: string) => ({
  driver: 's3' as const,
  s3: {
    endpoint,
    region: 'auto',
    bucket: 'media',
    accessKeyId: 'key',
    ...(publicBaseUrl === undefined ? {} : { publicBaseUrl }),
  },
});

test('storage URLs that cannot be parsed are refused, not thrown', () => {
  for (const value of ['', 'not a url', 'https://', 'ftp://example.com'])
    expect(mediaStorageInputSchema.safeParse(s3(value)).success).toBe(false);
  expect(
    mediaStorageInputSchema.safeParse(s3('https://s3.example.com', 'cdn'))
      .success,
  ).toBe(false);
  expect(
    mediaStorageInputSchema.safeParse(s3('https://user:pw@s3.example.com'))
      .success,
  ).toBe(false);
  expect(
    mediaStorageInputSchema.safeParse(
      s3('https://s3.example.com', 'https://cdn.example.com'),
    ).success,
  ).toBe(true);
});
