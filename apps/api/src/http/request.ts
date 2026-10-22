import { CONTENT_UNLOCK_HEADER } from '@cms/sdk';
import type { UserProfile } from '@cms/sdk';
import {
  DomainError,
  invalidInput,
  payloadTooLarge,
  unauthorized,
  Errors,
} from '#api/shared/errors';

export interface Authenticator {
  authenticate(token: string): Promise<UserProfile | null>;
}

export const SMALL_BODY_BYTES = 32 * 1024;
export const JSON_BODY_BYTES = 512 * 1024;
export const CONTENT_BODY_BYTES = 1024 * 1024;

/** Reads at most `maxBytes`, canceling the stream as soon as it crosses the limit. */
export const readBytes = async (request: Request, maxBytes: number) => {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw payloadTooLarge(Errors.RequestBodyTooLarge);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

export const readText = async (request: Request, maxBytes: number) =>
  new TextDecoder().decode(await readBytes(request, maxBytes));

export const readJson = async (
  request: Request,
  maxBytes = JSON_BODY_BYTES,
): Promise<unknown> => {
  try {
    return JSON.parse(await readText(request, maxBytes)) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidInput(Errors.RequestBodyNotJson);
  }
};

export const bearerToken = (request: Request) => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
};

export const currentUser = async (auth: Authenticator, request: Request) => {
  const token = bearerToken(request);
  return token ? auth.authenticate(token) : null;
};

export const requireUser = async (auth: Authenticator, request: Request) => {
  const user = await currentUser(auth, request);
  if (!user) throw unauthorized();
  return user;
};

/** The visitor's unlock proofs for protected entries (`<id>.<token>`, comma separated). */
export const unlockProofs = (request: Request) =>
  (request.headers.get(CONTENT_UNLOCK_HEADER) ?? '')
    .split(',')
    .map((proof) => proof.trim())
    .filter(Boolean)
    .slice(0, 20);
