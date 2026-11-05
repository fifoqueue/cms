import type { FeedOptions } from '#lib/server/seo-discovery.js';

/** JSON Feed 1.1 shares the RSS filter payload and publication selection. */
export const jsonFeed = (
  values: NonNullable<FeedOptions['filtered']>,
  origin: string,
  path: string,
  bodies?: FeedOptions['bodies'],
) =>
  Response.json(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: values.channel.title,
      home_page_url: values.channel.link,
      feed_url: origin + path,
      description: values.channel.description,
      language: values.channel.language,
      items: values.items.map((item) => ({
        id: `urn:uuid:${item.id}`,
        url: item.link,
        title: item.title,
        summary: item.description,
        content_text: item.description,
        ...(bodies?.get(item.id)?.html && {
          content_html: bodies
            .get(item.id)!
            .html.replace(/(\s(?:src|href|poster)=")\/(?!\/)/g, `$1${origin}/`),
        }),
        date_published: item.publishedAt,
        date_modified: item.updatedAt,
        ...(item.author && { authors: [{ name: item.author }] }),
      })),
    },
    {
      headers: {
        'content-type': 'application/feed+json; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    },
  );
