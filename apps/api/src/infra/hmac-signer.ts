import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Signer } from '#api/domain/ports';

/** HMAC-SHA256 in base64url; the key is derived from the stored-secrets key. */
export const hmacSigner = (secret: string): Signer => {
  const key = createHmac('sha256', secret).update('cms:signer').digest();
  const sign = (value: string) =>
    createHmac('sha256', key).update(value).digest('base64url');
  return {
    sign,
    verify(value, signature) {
      const expected = Buffer.from(sign(value));
      const actual = Buffer.from(signature);
      return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
      );
    },
  };
};
