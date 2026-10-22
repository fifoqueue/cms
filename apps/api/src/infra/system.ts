import { InvalidDocumentError } from '@cms/content';
import { parseHtml } from '@cms/content/parse';
import { renderDocument } from '@cms/content/render';
import type { ContentDocument } from '@cms/sdk';
import { CryptoHasher, password, randomUUIDv7, semver } from 'bun';
import type { PasswordHasher, TokenIssuer } from '#api/domain/auth/ports';
import type { DocumentRenderer } from '#api/domain/content/content-repository';
import type { HtmlParser } from '#api/domain/tools/import-service';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type { UpdateFeed, VersionPolicy } from '#api/plugin-runtime/ports';
import { invalidInput, Errors } from '#api/shared/errors';

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
        throw invalidInput(Errors.InvalidDocument(error.message));
      throw error;
    }
  },
};

export const semverPolicy = (core: string): VersionPolicy => ({
  core,
  satisfies: (version, range) => semver.satisfies(version, range),
  compare: (a, b) => semver.order(a, b),
});

/** Update answers are tiny; anything larger is refused. */
const MAX_FEED_BYTES = 64 * 1024;

export const httpsUpdateFeed: UpdateFeed = {
  async read(url) {
    if (!url.startsWith('https://'))
      throw new Error(Errors.PluginUpdateUnavailable);
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(Errors.PluginUpdateUnavailable);
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_FEED_BYTES)
      throw new Error(Errors.PluginUpdateUnavailable);
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  },
};

export const tiptapHtmlParser: HtmlParser = {
  parse: (html) => parseHtml(html),
};
