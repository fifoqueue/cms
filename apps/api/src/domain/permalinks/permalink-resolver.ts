import { canonicalPermalinkPath, resolvePathQuerySchema } from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import type { PageRedirect } from '@cms/sdk';
import type { RedirectRegistry } from '#api/domain/permalinks/redirect-registry';
import type { HookDispatcher } from '#api/domain/ports';
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
    context?: 'single' | 'feed',
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
 * ownership-validated selected path and the request's own spelling.
 */
export class PermalinkResolver {
  constructor(
    private readonly paths: PathLookup,
    private readonly content: PublicContentById,
    private readonly redirects?: RedirectRegistry,
    private readonly hooks?: HookDispatcher,
  ) {}

  async resolve(
    query: unknown,
    proofs: readonly string[] = [],
    actor: Actor | null = null,
  ): Promise<
    ResolvedPath | { content: null; redirect: true; destination: PageRedirect }
  > {
    const { path, context } = parseInput(resolvePathQuerySchema, query);

    if (this.redirects && !this.redirects.empty) {
      const destination = await this.redirects.resolve(path);

      if (destination) return { content: null, redirect: true, destination };
    }

    const canonical = canonicalPermalinkPath(path);
    const owner =
      canonical &&
      ((await this.paths.findByPath(canonical)) ??
        (await this.paths.findByPath(
          canonical.endsWith('/') ? canonical.slice(0, -1) : `${canonical}/`,
        )));
    const content =
      owner &&
      (await this.content.getById(owner.contentId, proofs, actor, context));

    if (!owner || !content) {
      if (this.hooks?.has('request.notFound'))
        await this.hooks.emit('request.notFound', { path });

      throw notFound(Errors.ContentNotFound);
    }

    return { content, redirect: content.path !== path };
  }
}
