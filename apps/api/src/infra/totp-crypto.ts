import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TotpAlgorithm } from '#api/domain/auth/totp/ports';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const base32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
};

const decode = (secret: string): Buffer | null => {
  if (!/^[A-Z2-7]{32}$/.test(secret)) return null;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const letter of secret) {
    value = (value << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
};

/** RFC 6238 dynamic truncation, fixed SHA-1. Eight digits are only for Appendix B tests. */
export const totpCode = (
  key: Uint8Array,
  step: number,
  digits: 6 | 8 = 6,
): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits)
    .toString()
    .padStart(digits, '0');
};

export const totpAlgorithm: TotpAlgorithm = {
  secret: () => base32(randomBytes(20)),
  match(secret, code, now) {
    const key = decode(secret);
    if (!key || !/^\d{6}$/.test(code)) return null;
    const current = Math.floor(now.getTime() / 30000);
    let matched: number | null = null;
    // Evaluate the entire window, even on a match. Prefer the latest matching step.
    for (const step of [current - 1, current, current + 1]) {
      if (
        step >= 0 &&
        timingSafeEqual(Buffer.from(code), Buffer.from(totpCode(key, step)))
      )
        matched = step;
    }
    return matched;
  },
};
