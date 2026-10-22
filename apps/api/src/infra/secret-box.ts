import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecretBox } from '#api/domain/ports';

const VERSION = 'v1';

/**
 * AES-256-GCM with a key derived from `secret`. The sealed form is
 * `v1:<iv>:<tag>:<ciphertext>` in base64url.
 */
export const aesSecretBox = (secret: string): SecretBox => {
  const key = createHash('sha256').update(secret).digest();
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([
        cipher.update(plain, 'utf8'),
        cipher.final(),
      ]);
      return [VERSION, iv, cipher.getAuthTag(), body]
        .map((part) =>
          typeof part === 'string' ? part : part.toString('base64url'),
        )
        .join(':');
    },
    open(sealed) {
      const [version, iv, tag, body] = sealed.split(':');
      if (version !== VERSION || !iv || !tag || body === undefined) return null;
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(iv, 'base64url'),
        );
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(body, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
};

/** The configured key, else the key file at `path`, created (0600) with a random key if missing. */
export const secretKey = (configured: string | undefined, path: string) => {
  if (configured) return configured;
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      writeFileSync(path, randomBytes(32).toString('base64url'), {
        mode: 0o600,
        flag: 'wx',
      });
    } catch (error) {
      // Another process created it first; use theirs.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  return readFileSync(path, 'utf8').trim();
};
