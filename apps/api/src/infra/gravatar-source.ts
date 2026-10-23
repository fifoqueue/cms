import { createHash } from 'node:crypto';
import type { AvatarDefault } from '@cms/sdk';
import type {
  AvatarImage,
  AvatarSource,
} from '#api/domain/comments/avatar-service';
import { sniffMediaType } from '#api/domain/media/sniff';
import { publicFetch } from '#api/infra/egress-policy';

type HttpFetch = typeof publicFetch;
interface Cached {
  image: AvatarImage;
  expires: number;
}

const MAX_BYTES = 512 * 1024;
const MAX_CACHE_ITEMS = 128;
const DAY = 24 * 60 * 60 * 1000;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

const hash = (value: string) => createHash('md5').update(value).digest('hex');

const fallback = (emailHash: string, style: AvatarDefault, size: number) => {
  const color = `#${emailHash.slice(0, 6)}`;
  const body =
    style === 'blank'
      ? ''
      : `<circle cx="${size / 2}" cy="${size * 0.36}" r="${size * 0.2}"/><path d="M${size * 0.16} ${size}a${size * 0.34} ${size * 0.34} 0 0 1 ${size * 0.68} 0"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="${color}">${body}</svg>`;
  return {
    bytes: new TextEncoder().encode(svg),
    contentType: 'image/svg+xml',
  } satisfies AvatarImage;
};

const limitedBody = async (response: Response) => {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

/** Gravatar fetched behind the egress boundary; only bounded image bytes are cached. */
export class GravatarSource implements AvatarSource {
  private readonly cache = new Map<string, Cached>();
  private readonly pending = new Map<string, Promise<AvatarImage>>();

  constructor(private readonly fetcher: HttpFetch = publicFetch) {}

  async image(email: string, style: AvatarDefault, size: number) {
    const emailHash = hash(email);
    const key = `${emailHash}:${style}:${size}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.image;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const loading = this.load(emailHash, style, size).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, loading);
    const image = await loading;
    this.cache.set(key, {
      image,
      expires:
        Date.now() +
        (image.contentType === 'image/svg+xml' ? 60 * 60 * 1000 : DAY),
    });
    while (this.cache.size > MAX_CACHE_ITEMS)
      this.cache.delete(this.cache.keys().next().value!);
    return image;
  }

  private async load(emailHash: string, style: AvatarDefault, size: number) {
    try {
      const response = await this.fetcher(
        `https://www.gravatar.com/avatar/${emailHash}?d=${encodeURIComponent(style)}&s=${size}`,
        {
          signal: AbortSignal.timeout(5_000),
          headers: { accept: 'image/*', 'user-agent': 'cms-avatar-proxy' },
        },
      );
      const contentType = response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      if (!response.ok || !contentType || !ALLOWED_TYPES.has(contentType)) {
        await response.body?.cancel();
        return fallback(emailHash, style, size);
      }
      const bytes = await limitedBody(response);
      const detected = bytes && sniffMediaType(bytes);
      return bytes?.length && detected?.startsWith('image/')
        ? { bytes, contentType: detected }
        : fallback(emailHash, style, size);
    } catch {
      return fallback(emailHash, style, size);
    }
  }
}
