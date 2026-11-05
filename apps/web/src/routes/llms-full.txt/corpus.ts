import type { ContentClient } from '@cms/sdk/client';
import type { PublicSeoSettings } from '@cms/sdk';
import { contentMarkdown } from '#lib/server/markdown.js';
import { isDiscoverable, newestDate } from '#lib/server/seo-discovery.js';
import { mapLimit } from '#lib/server/bounded.js';

/** Whole entries only: at most 200 documents, 2,000 summaries and 500 KiB of UTF-8. */
export const loadCorpus = async (
  api: ContentClient,
  settings: PublicSeoSettings,
  lang: string,
) => {
  const documents: string[] = [];
  const dates: string[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;

  for (let page = 1; page <= 20 && documents.length < 200; page++) {
    const result = await api.list({
      page,
      pageSize: 100,
      orderby: 'id',
      order: 'desc',
    });
    const summaries = result.items.filter((item) =>
      isDiscoverable(item, settings),
    );
    const entries = await mapLimit(summaries, async (item) => {
      const resolved = await api.resolvePath(item.path);

      return resolved.content && isDiscoverable(resolved.content, settings)
        ? resolved.content
        : null;
    });

    for (const entry of entries) {
      if (!entry) continue;
      const markdown = contentMarkdown(entry, settings.siteUrl, lang);
      const size = encoder.encode(markdown + '\n').byteLength;

      if (bytes + size > 512000 || documents.length === 200) continue;
      documents.push(markdown);
      dates.push(entry.updatedAt);
      bytes += size;
    }

    if (page * 100 >= result.total) break;
  }

  return { text: documents.join('\n'), modified: newestDate(dates) };
};
