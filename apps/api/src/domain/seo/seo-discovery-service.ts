import { seoSitemapEntrySchema, seoSitemapQuerySchema } from '@cms/sdk';
import type { Paginated, SeoSitemapEntry } from '@cms/sdk';
import type { SeoDiscoveryRepository } from '#api/domain/seo/seo-discovery-repository';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { parseInput } from '#api/shared/validation';

export class SeoDiscoveryService {
  constructor(
    private readonly repository: SeoDiscoveryRepository,
    private readonly settings: SeoSettingsService,
  ) {}

  async list(query: unknown): Promise<Paginated<SeoSitemapEntry>> {
    const criteria = parseInput(seoSitemapQuerySchema, query);
    const { kind, page, pageSize } = criteria;
    const settings = await this.settings.getPublic();
    if (
      !settings.indexingEnabled ||
      (kind === 'category' && !settings.indexCategories) ||
      (kind === 'tag' && !settings.indexTags)
    )
      return { items: [], total: 0, page, pageSize };

    const result = await this.repository.list({
      ...criteria,
      siteUrl: settings.siteUrl,
    });
    return {
      items: result.items.map((item) =>
        seoSitemapEntrySchema.parse({
          path: item.path,
          title: item.title,
          description: item.description,
          updatedAt: item.updatedAt.toISOString(),
        }),
      ),
      total: result.total,
      page,
      pageSize,
    };
  }
}
