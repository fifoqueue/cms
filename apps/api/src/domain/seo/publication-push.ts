import type { ContentEntry, PublicSeoSettings } from '@cms/sdk';
import type { HookRegistrar } from '@cms/sdk/plugin';
import type { Logger } from '#api/shared/logger';

/** Delivery is bounded by the adapter and rejects failures; callers isolate each destination. */
export interface PublicationTransport {
  indexNow(origin: string, key: string, urls: readonly string[]): Promise<void>;
  webSub(hub: string, feed: string): Promise<void>;
}

export class PublicationPush {
  constructor(
    private readonly settings: () => Promise<PublicSeoSettings>,
    private readonly transport: PublicationTransport,
    private readonly logger: Logger,
  ) {}

  subscribe(hooks: Pick<HookRegistrar, 'on'>) {
    hooks.on('content.published', (entry) => {
      void this.notify([entry]);
    });
    hooks.on('content.updated', (entry) => {
      if (entry.previous.status === 'published')
        void this.notify([
          entry.previous,
          ...(entry.status === 'published' ? [entry] : []),
        ]);
    });
    hooks.on('content.trashed', (entry) => {
      if (entry.status === 'published') void this.notify([entry]);
    });
    hooks.on('content.deleted', (entry) => {
      if (entry.status === 'published') void this.notify([entry]);
    });
    hooks.on('content.restored', (entry) => {
      if (entry.status === 'published') void this.notify([entry]);
    });
  }

  /** Previous public paths are included for removals and permalink changes. Never rejects. */
  async notify(entries: readonly ContentEntry[]) {
    try {
      const settings = await this.settings();

      if (!settings.siteUrl) return;
      const urls = [
        ...new Set(
          entries
            .filter(
              (entry) =>
                !entry.protected &&
                !entry.seo.noIndex &&
                (!entry.seo.canonicalUrl ||
                  entry.seo.canonicalUrl === settings.siteUrl + entry.path),
            )
            .flatMap((entry) =>
              entry.path ? [settings.siteUrl + entry.path] : [],
            ),
        ),
      ];
      const tasks: Promise<void>[] = [];

      if (
        settings.indexingEnabled &&
        settings.indexNowEnabled &&
        settings.indexNowKey &&
        urls.length
      )
        tasks.push(
          this.transport.indexNow(settings.siteUrl, settings.indexNowKey, urls),
        );
      if (settings.feedsEnabled && settings.webSubHub)
        tasks.push(
          this.transport.webSub(
            settings.webSubHub,
            `${settings.siteUrl}/feed.xml`,
          ),
        );

      const results = await Promise.allSettled(tasks);

      for (const result of results)
        if (result.status === 'rejected')
          this.logger.warn('Discovery notification skipped', result.reason);
    } catch (error) {
      this.logger.warn('Discovery notification skipped', error);
    }
  }
}
