import { InvalidDocumentError } from '@cms/content';
import { renderDocument } from '@cms/content/render';
import type { ContentDocument } from '@cms/sdk';
import { CryptoHasher, password, randomUUIDv7 } from 'bun';
import type { PasswordHasher, TokenIssuer } from '../domain/auth/ports';
import type { DocumentRenderer } from '../domain/content/content-repository';
import type { Clock, IdGenerator } from '../domain/ports';
import { invalidInput } from '../shared/errors';

export const systemClock: Clock = { now: () => new Date() };

export const uuidV7: IdGenerator = { next: () => randomUUIDv7() };

export const bunPasswordHasher: PasswordHasher = {
  hash: (plain) => password.hash(plain),
  verify: (plain, hash) => password.verify(plain, hash),
};

export const randomTokenIssuer: TokenIssuer = {
  issue: () =>
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      'base64url',
    ),
  digest: (token) => new CryptoHasher('sha256').update(token).digest('hex'),
};

export const tiptapRenderer: DocumentRenderer = {
  render(document: ContentDocument) {
    try {
      return renderDocument(document);
    } catch (error) {
      if (error instanceof InvalidDocumentError)
        throw invalidInput(`Invalid document: ${error.message}`);
      throw error;
    }
  },
};
