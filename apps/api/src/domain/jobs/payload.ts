import { stringifyJson } from '@cms/sdk';
import type { SecretBox } from '#api/domain/ports';
export const sealJob = (payload: unknown, secrets: SecretBox) => ({
  version: 1,
  sealed: secrets.seal(stringifyJson(payload)),
});
export const openJob = (payload: unknown, secrets: SecretBox): unknown => {
  if (!payload || typeof payload !== 'object' || !('sealed' in payload))
    return payload;
  if (typeof payload.sealed !== 'string') return null;
  const plain = secrets.open(payload.sealed);
  if (!plain) return null;
  try {
    return JSON.parse(plain);
  } catch {
    return null;
  }
};
