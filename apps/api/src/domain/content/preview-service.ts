import { publicContentSchema } from '@cms/sdk';
import type { PreviewToken, PublicContent } from '@cms/sdk';
import { toPublicEntrySeo } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type { ContentService } from '#api/domain/content/content-service';
import type { DocumentRenderer } from '#api/domain/content/content-repository';
import type { RevisionRepository } from '#api/domain/content/revisions';
import type { Embeds } from '#api/domain/content/embeds';
import type { FieldService } from '#api/domain/content/fields';
import type { Clock, Signer } from '#api/domain/ports';
import { notFound, Errors } from '#api/shared/errors';

const LIFETIME_MS = 60 * 60 * 1000;

/**
 * Previews of unsaved or unpublished changes. A preview link is signed for one entry and one
 * user and expires after an hour; it shows that user's autosave when newer than the entry.
 */
export class PreviewService {
  constructor(
    private readonly deps: {
      content: ContentService;
      revisions: RevisionRepository;
      renderer: DocumentRenderer;
      signer: Signer;
      clock: Clock;
      embeds: Pick<Embeds, 'expand'>;
      fields: Pick<FieldService, 'present'>;
    },
  ) {}

  async create(contentId: string, actor: Actor): Promise<PreviewToken> {
    const record = await this.deps.content.require(contentId);
    this.deps.content.assertEditable(actor, record);
    const expires = this.deps.clock.now().getTime() + LIFETIME_MS;
    const payload = `${contentId}.${actor.id}.${expires}`;
    return {
      token: `${payload}.${this.deps.signer.sign(payload)}`,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  /** The entry as the site would show it, including the preview author's latest autosave. */
  async render(token: string): Promise<PublicContent> {
    const [contentId, userId, expires, signature] = token.split('.');
    if (
      !contentId ||
      !userId ||
      !signature ||
      Number(expires) <= this.deps.clock.now().getTime() ||
      !this.deps.signer.verify(`${contentId}.${userId}.${expires}`, signature)
    )
      throw notFound(Errors.PreviewInvalid);
    const record = await this.deps.content.require(contentId);
    const autosave = await this.deps.revisions.findAutosave(contentId, userId);
    const text =
      autosave && autosave.createdAt > record.updatedAt ? autosave : record;
    return publicContentSchema.parse({
      id: record.id,
      type: record.type,
      slug: record.slug,
      path: record.path,
      title: text.title,
      excerpt: text.excerpt || record.summary,
      html: await this.deps.embeds.expand(
        this.deps.renderer.render(text.document),
      ),
      publishedAt: (record.publishedAt ?? record.updatedAt).toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      categories: record.categories.map(({ id, name, slug }) => ({
        id,
        name,
        slug,
      })),
      tags: record.tags.map(({ id, name, slug }) => ({ id, name, slug })),
      author: { name: record.authorName, slug: record.authorSlug },
      sticky: record.sticky,
      commentCount: record.commentCount,
      protected: false,
      featuredImage: record.featuredImage,
      fields: await this.deps.fields.present(record.type, record.fields),
      seo: toPublicEntrySeo(record.seo),
      meta: {},
    });
  }
}
