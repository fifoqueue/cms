import { canonicalPermalinkPath, slotQuerySchema } from '@cms/sdk';
import type { PublicContent, SlotMap } from '@cms/sdk';
import type { PublishedContentReader } from '#api/domain/content/public-content';
import type { PathLookup } from '#api/domain/permalinks/permalink-repository';
import type { SiteService } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import { emptySlots } from '#api/plugin-runtime/slot-registry';
import type { SlotRegistry } from '#api/plugin-runtime/slot-registry';

export interface SlotServiceDeps {
  registry: SlotRegistry;
  site: SiteService;
  content: PublishedContentReader;
  paths: PathLookup;
}

/** Renders every slot for one frontend page. */
export class SlotService {
  constructor(private readonly deps: SlotServiceDeps) {}

  async render(query: unknown): Promise<SlotMap> {
    const { path, contentId } = parseInput(slotQuerySchema, query);
    // Site and content only feed renderers; without any, skip the reads.
    if (this.deps.registry.empty) return emptySlots();
    const [site, content] = await Promise.all([
      this.deps.site.get(),
      contentId ? this.deps.content.getById(contentId) : this.byPath(path),
    ]);
    return this.deps.registry.render({ path, site, content });
  }

  /**
   * Content at its exact current path, so a page can request slots while resolving its content.
   * Redirects and other spellings get none; those pages redirect instead of rendering.
   */
  private async byPath(path: string): Promise<PublicContent | null> {
    if (canonicalPermalinkPath(path) !== path) return null;
    const owner = await this.deps.paths.findByPath(path);
    return owner?.current ? this.deps.content.getById(owner.contentId) : null;
  }
}
