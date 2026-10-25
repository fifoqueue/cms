import { createHash, createHmac } from 'node:crypto';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest();
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** SigV4 for fixed REST requests, including the exact serialized payload. */
export function signAws(input: {
  url: string;
  method: string;
  body: string;
  headers?: Record<string, string>;
  region: string;
  service: string;
  keyId: string;
  secret: string;
  date: Date;
}): Record<string, string> {
  const url = new URL(input.url);
  const timestamp = input.date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = timestamp.slice(0, 8);
  const headers: Record<string, string> = {
    ...input.headers,
    host: url.host,
    'x-amz-date': timestamp,
    'x-amz-content-sha256': hash(input.body),
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const query = [...url.searchParams]
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .sort()
    .join('&');
  const canonical = [
    input.method,
    url.pathname,
    query,
    names
      .map((name) => `${name}:${headers[name]!.trim().replace(/\s+/g, ' ')}\n`)
      .join(''),
    signedHeaders,
    hash(input.body),
  ].join('\n');
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const key = hmac(
    hmac(hmac(hmac(`AWS4${input.secret}`, day), input.region), input.service),
    'aws4_request',
  );
  const signature = hmac(
    key,
    `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`,
  ).toString('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.keyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
  };
}
