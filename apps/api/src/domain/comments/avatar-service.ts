import type { AvatarDefault, DiscussionSettings } from '@cms/sdk';
import type { Signer } from '#api/domain/ports';

export interface AvatarImage {
  bytes: Uint8Array;
  contentType: string;
}

export interface AvatarDirectory {
  /** Resolves only a public comment or author key. The email never leaves the API. */
  email(key: string): Promise<string | null>;
}

export interface AvatarSource {
  image(
    email: string,
    style: AvatarDefault,
    size: number,
  ): Promise<AvatarImage>;
}

const encode = (value: string) =>
  [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const decode = (value: string) => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value) || value.length > 800) return null;
  const bytes = Uint8Array.from(value.match(/.{2}/g) ?? [], (part) =>
    Number.parseInt(part, 16),
  );
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const SIZES = new Set([32, 48, 64, 96, 128, 256, 512]);

/** Signed same-origin avatar URLs and server-side email resolution. */
export class AvatarService {
  constructor(
    private readonly directory: AvatarDirectory,
    private readonly source: AvatarSource,
    private readonly signer: Signer,
  ) {}

  url(key: string, settings: DiscussionSettings): string | null {
    if (!settings.showAvatars) return null;
    const id = encode(key);
    const signature = this.signer.sign(`avatar:v1:${id}`);
    return `/avatars/${id}.${signature}?s=96`;
  }

  async image(
    token: string,
    size: number,
    settings: DiscussionSettings,
  ): Promise<AvatarImage | null> {
    if (!settings.showAvatars || token.length > 1_000) return null;
    const separator = token.lastIndexOf('.');
    if (separator < 1) return null;
    const id = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    if (!this.signer.verify(`avatar:v1:${id}`, signature)) return null;
    const key = decode(id);
    if (!key) return null;
    const email = await this.directory.email(key);
    if (!email) return null;
    const requested = Math.trunc(size);
    return this.source.image(
      email.trim().toLowerCase(),
      settings.avatarDefault,
      SIZES.has(requested) ? requested : 96,
    );
  }
}
