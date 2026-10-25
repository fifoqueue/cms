import { seoSitemapEntrySchema, seoSitemapQuerySchema } from '@cms/sdk';
import type { Paginated, SeoSitemapEntry } from '@cms/sdk';
import type { SeoDiscoveryRepository } from '#api/domain/seo/seo-discovery-repository';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import { parseInput } from '#api/shared/validation';
import type { SitemapRequest, SitemapPage } from '@cms/sdk/plugin';

export class SeoDiscoveryService {
  constructor(
    private readonly repository: SeoDiscoveryRepository,
    private readonly settings: SeoSettingsService,
    private readonly providers?: {
      resolve(query: SitemapRequest, key: string): Promise<SitemapPage | null>;
      keys(): string[];
    },
  ) {}

  providersList() {
    return (
      this.providers?.keys() ?? [
        'content',
        'category',
        'tag',
        'author',
        'taxonomy',
      ]
    );
  }

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

    const coreKind = [
      'content',
      'category',
      'tag',
      'author',
      'taxonomy',
    ].includes(kind);
    const provided = this.providers
      ? await this.providers.resolve(
          { page, pageSize, siteUrl: settings.siteUrl },
          kind,
        )
      : null;
    const result =
      this.providers || !coreKind
        ? null
        : await this.repository.list({
            ...criteria,
            kind: kind as
              'content' | 'category' | 'tag' | 'author' | 'taxonomy',
            siteUrl: settings.siteUrl,
          });
    const entries =
      provided?.items ??
      result?.items.map((item) =>
        seoSitemapEntrySchema.parse({
          path: item.path,
          title: item.title,
          description: item.description,
          updatedAt: item.updatedAt.toISOString(),
        }),
      ) ??
      [];
    return {
      items: seoSitemapEntrySchema.array().parse(
        await this.settings.filterOutput({
          kind: 'sitemap.entries',
          value: entries,
        }),
      ),
      total: provided?.total ?? result?.total ?? 0,
      page,
      pageSize,
    };
  }
}
