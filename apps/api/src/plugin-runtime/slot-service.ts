import { slotQuerySchema } from '@cms/sdk';
import type { SlotMap } from '@cms/sdk';
import type { PublishedContentReader } from '../domain/content/public-content';
import type { SiteService } from '../domain/site/site-service';
import { parseInput } from '../shared/validation';
import type { SlotRegistry } from './slot-registry';

export interface SlotServiceDeps {
  registry: SlotRegistry;
  site: SiteService;
  content: PublishedContentReader;
}

/** Renders every slot for one frontend page. */
export class SlotService {
  constructor(private readonly deps: SlotServiceDeps) {}

  async render(query: unknown): Promise<SlotMap> {
    const { path, contentId } = parseInput(slotQuerySchema, query);
    const [site, content] = await Promise.all([
      this.deps.site.get(),
      contentId ? this.deps.content.getById(contentId) : null,
    ]);
    return this.deps.registry.render({ path, site, content });
  }
}
