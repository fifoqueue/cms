import { stringifyJson } from '@cms/sdk';
import type { SecretBox } from '#api/domain/ports';
export const sealJob = (payload: unknown, secrets: SecretBox) => ({
  version: 1,
  sealed: secrets.seal(stringifyJson(payload)),
});

export type OpenJobResult =
  | { ok: true; value: unknown; sealed: boolean }
  | { ok: false; reason: 'invalid' | 'unreadable' };

/** Opens the shared envelope while distinguishing bad data from a temporary key mismatch. */
export const inspectJob = (
  payload: unknown,
  secrets: SecretBox,
): OpenJobResult => {
  if (!payload || typeof payload !== 'object' || !('sealed' in payload))
    return { ok: true, value: payload, sealed: false };
  if (
    !('version' in payload) ||
    payload.version !== 1 ||
    typeof payload.sealed !== 'string'
  )
    return { ok: false, reason: 'invalid' };
  const plain = secrets.open(payload.sealed);
  if (plain === null) return { ok: false, reason: 'unreadable' };
  try {
    return { ok: true, value: JSON.parse(plain) as unknown, sealed: true };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
};

export const openJob = (payload: unknown, secrets: SecretBox): unknown => {
  const result = inspectJob(payload, secrets);
  return result.ok ? result.value : null;
};
