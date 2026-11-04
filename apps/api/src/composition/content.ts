import type { createRepositories } from '#api/composition/repositories';
import type { createRegistries } from '#api/composition/registries';
import { ContentTypeService } from '#api/domain/content/content-types';
import { FieldService } from '#api/domain/content/fields';
import { TaxonomyTypeService } from '#api/domain/taxonomy/taxonomy-types';
import {
  TaxonomyService,
  PublicTaxonomyService,
} from '#api/domain/taxonomy/taxonomy-service';
import { VisibleContentRepository } from '#api/domain/content/visible-content';
import { TocRenderer } from '#api/domain/content/automatic-toc';
import {
  PublishedContentReader,
  PublicContentService,
} from '#api/domain/content/public-content';
import { ResponsiveImages } from '#api/domain/content/responsive-images';
import { EmbedService } from '#api/domain/site/embed-service';
import { Embeds } from '#api/domain/content/embeds';
import type { HtmlExpander } from '#api/domain/content/embeds';
import { PatternService } from '#api/domain/content/pattern-service';
import { ContentLocks } from '#api/domain/content/content-locks';
import { PermalinkService } from '#api/domain/permalinks/permalink-service';
import { PermalinkResolver } from '#api/domain/permalinks/permalink-resolver';
import { ArchivePathsService } from '#api/domain/permalinks/archive-paths';
import { ContentService } from '#api/domain/content/content-service';
import { RevisionService } from '#api/domain/content/revision-service';
import { PreviewService } from '#api/domain/content/preview-service';
import type { WritingService } from '#api/domain/site/writing-service';
import type { SiteService } from '#api/domain/site/site-service';
import type { Scheduler } from '#api/domain/jobs/scheduler';
import {
  bunPasswordHasher,
  systemClock,
  tiptapRenderer,
  uuidV7,
} from '#api/infra/system';

type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'contentRepository'
  | 'settingsRepository'
  | 'taxonomyRepository'
  | 'rawPublishedRepository'
  | 'mediaRepository'
  | 'permalinkRepository'
  | 'patternTransactions'
  | 'patternCatalog'
  | 'users'
  | 'revisions'
  | 'archiveStore'
> &
  Pick<
    ReturnType<typeof createRegistries>,
    | 'hooks'
    | 'redirects'
    | 'contentTypeRegistry'
    | 'fieldRegistry'
    | 'taxonomyRegistry'
    | 'embedRegistry'
    | 'blockRegistry'
    | 'shortcodes'
    | 'patternContributions'
  > & {
    writing: WritingService['get'];
    site: SiteService['get'];
    signer: ConstructorParameters<typeof ContentLocks>[0]['signer'];
    protection: ConstructorParameters<typeof ContentLocks>[0]['protection'];
    searchLookup: ConstructorParameters<typeof PublicContentService>[6];
    /** Invalidated by settings writes, which include field definition changes. */
    publicCache: ConstructorParameters<typeof FieldService>[0]['cache'];
  };

export const createContent = ({
  contentRepository,
  settingsRepository,
  taxonomyRepository,
  rawPublishedRepository,
  mediaRepository,
  permalinkRepository,
  patternTransactions,
  patternCatalog,
  users,
  revisions,
  archiveStore,
  hooks,
  redirects,
  contentTypeRegistry,
  fieldRegistry,
  taxonomyRegistry,
  embedRegistry,
  blockRegistry,
  shortcodes,
  patternContributions,
  writing,
  site,
  signer,
  protection,
  searchLookup,
  publicCache,
}: Input) => {
  const embedSettings = new EmbedService(settingsRepository, hooks);
  const embeds = new Embeds(
    async () => [
      ...(await embedSettings.providers()),
      ...embedRegistry.providers(),
    ],
    undefined,
    hooks,
  );
  const patterns = new PatternService({
    contributions: patternContributions,
    hooks,
    settings: settingsRepository,
    transactions: patternTransactions,
    catalog: patternCatalog,
    renderer: tiptapRenderer,
    ids: uuidV7,
    clock: systemClock,
    blocks: blockRegistry,
  });
  const taxonomyTypes = new TaxonomyTypeService(
    settingsRepository,
    taxonomyRepository,
    taxonomyRegistry,
  );
  const contentTypes = new ContentTypeService(
    settingsRepository,
    (type) => contentRepository.typeInUse(type),
    hooks,
    contentTypeRegistry,
  );
  const fields = new FieldService({
    registry: fieldRegistry,
    hooks,
    settings: settingsRepository,
    images: (ids) => mediaRepository.publicImages(ids),
    cache: publicCache,
  });
  const adminTaxonomy = new TaxonomyService({
    content: contentRepository,
    hooks,
    fields,
    types: taxonomyTypes,
    repository: taxonomyRepository,
    ids: uuidV7,
    clock: systemClock,
  });
  const activeContentTypes = async () =>
    (await contentTypes.list()).map((type) => type.key);
  const publishedRepository = new VisibleContentRepository(
    rawPublishedRepository,
    activeContentTypes,
  );
  const tocRenderer = new TocRenderer({
    content: contentRepository,
    settings: async () => {
      const [settings, display] = await Promise.all([writing(), site()]);

      return { writing: settings, locale: display.locale };
    },
  });
  const reader = new PublishedContentReader(
    publishedRepository,
    (record, visibility) => tocRenderer.published(record, visibility),
    hooks,
  );
  const responsiveImages = new ResponsiveImages((ids) =>
    mediaRepository.publicImages(ids),
  );
  // Expand synced patterns first so their embeds, blocks and images are expanded too.
  const served: HtmlExpander = {
    expand: async (html, context) =>
      responsiveImages.expand(
        await blockRegistry.expand(
          await embeds.expand(
            await shortcodes.expand(await patterns.expand(html), context),
          ),
          context,
        ),
      ),
  };
  const locks = new ContentLocks({
    repository: publishedRepository,
    hasher: bunPasswordHasher,
    signer,
    clock: systemClock,
    protection,
  });
  const publicContent = new PublicContentService(
    reader,
    hooks,
    locks,
    served,
    fields,
    contentTypes,
    searchLookup,
    (id) => permalinkRepository.pathsFor(id),
  );
  const archivePaths = new ArchivePathsService(archiveStore);
  const permalinks = new PermalinkService(permalinkRepository, hooks);
  const permalinkResolver = new PermalinkResolver(
    permalinkRepository,
    publicContent,
    redirects,
    hooks,
  );
  const content = new ContentService({
    repository: contentRepository,
    renderer: tiptapRenderer,
    hooks,
    ids: uuidV7,
    clock: systemClock,
    users,
    hasher: bunPasswordHasher,
    types: contentTypes,
    fields,
    blocks: blockRegistry,
    defaultCategory: async () => {
      const id = (await writing()).defaultCategoryId;
      const term = id && (await taxonomyRepository.findById(id, 'all'));

      return term && term.taxonomy === 'category' ? term.id : null;
    },
    registeredBlocks: () => blockRegistry.list().map((block) => block.block),
  });
  const contentRevisions = new RevisionService({
    hooks,
    content,
    revisions,
    renderer: tiptapRenderer,
    ids: uuidV7,
    clock: systemClock,
  });
  const previews = new PreviewService({
    hooks,
    renderBody: (document, record) => tocRenderer.preview(document, record),
    content,
    revisions,
    renderer: tiptapRenderer,
    signer,
    clock: systemClock,
    embeds: served,
    fields,
  });
  const publicTaxonomy = new PublicTaxonomyService(
    taxonomyRepository,
    taxonomyTypes,
    hooks,
    fields,
  );
  const schedulePermalinks = (scheduler: Pick<Scheduler, 'add'>) =>
    scheduler.add({
      name: 'core:permalink-regeneration',
      intervalMs: 5000,
      run: () => permalinkRepository.resume(),
    });
  const scheduleContent = (scheduler: Pick<Scheduler, 'add'>) => {
    scheduler.add({
      name: 'content.publishScheduled',
      intervalMs: 60_000,
      run: () => content.publishDue(),
    });
    scheduler.add({
      name: 'content.emptyTrash',
      intervalMs: 6 * 60 * 60 * 1000,
      run: () => content.emptyTrash(30),
    });
  };

  return {
    embedSettings,
    archivePaths,
    patterns,
    taxonomyTypes,
    contentTypes,
    fields,
    adminTaxonomy,
    activeContentTypes,
    publishedRepository,
    reader,
    locks,
    publicContent,
    permalinks,
    permalinkResolver,
    content,
    contentRevisions,
    previews,
    publicTaxonomy,
    schedulePermalinks,
    scheduleContent,
  };
};
