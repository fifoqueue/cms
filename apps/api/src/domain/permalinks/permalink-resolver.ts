import { canonicalPermalinkPath, resolvePathQuerySchema } from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { PathLookup } from '#api/domain/permalinks/permalink-repository';
import { notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/** Published content by id as the public API serves it (after `content.public`); `null` otherwise. */
export interface PublicContentById {
  /** `proofs` unlock password-protected entries. */
  getById(
    id: string,
    proofs?: readonly string[],
    actor?: Actor | null,
  ): Promise<PublicContent | null>;
}

export interface ResolvedPath {
  content: PublicContent;
  /** Permanent redirect to the content's current path. */
  redirect: boolean;
}

/**
 * Maps a request path to published content with one exact indexed lookup. Drafts and removed
 * content are never found, through current paths or redirects alike. `redirect` comes from the
 * stored path row and the request's own spelling, never from filtered content fields.
 */
export class PermalinkResolver {
  constructor(
    private readonly paths: PathLookup,
    private readonly content: PublicContentById,
  ) {}

  async resolve(
    query: unknown,
    proofs: readonly string[] = [],
    actor: Actor | null = null,
  ): Promise<ResolvedPath> {
    const { path } = parseInput(resolvePathQuerySchema, query);
    const canonical = canonicalPermalinkPath(path);
    const owner =
      canonical &&
      ((await this.paths.findByPath(canonical)) ??
        (await this.paths.findByPath(
          canonical.endsWith('/') ? canonical.slice(0, -1) : `${canonical}/`,
        )));
    const content =
      owner && (await this.content.getById(owner.contentId, proofs, actor));

    if (!owner || !content) throw notFound(Errors.ContentNotFound);

    return { content, redirect: !owner.current || content.path !== path };
  }
}
