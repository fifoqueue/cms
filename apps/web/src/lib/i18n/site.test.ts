import { test } from 'node:test';
import { equal, ok } from 'node:assert/strict';
import { messagesFor } from '#lib/i18n/index.js';
import { loadSiteMessages } from '#lib/i18n/site.js';
import { siteCatalog } from '#lib/i18n/site.server.js';

test('public messages retain their locale across server serialization and client loading', async () => {
  for (const locale of ['en-US', 'ko-KR', 'fr-FR']) {
    const catalog = siteCatalog(locale);
    const wire = JSON.stringify(catalog);
    const server = await loadSiteMessages(catalog);
    const client = await loadSiteMessages(JSON.parse(wire));
    const full = messagesFor(locale);
    ok(
      Object.values(catalog.strings).every((text) => typeof text === 'string'),
    );
    ok(!wire.includes('seoFocusKeyword'));
    for (const [key, value] of Object.entries(catalog.strings)) {
      equal(server[key as keyof typeof catalog.strings], value);
      equal(client[key as keyof typeof catalog.strings], value);
    }
    for (const m of [server, client]) {
      equal(m.adminBar, full.adminBar);
      equal(m.themeSearchTitle('tea'), full.themeSearchTitle('tea'));
      equal(
        m.themeFeedTitle('Site', 'Posts'),
        full.themeFeedTitle('Site', 'Posts'),
      );
      equal(m.commentCount(2), full.commentCount(2));
      equal(
        m.commentRemember(['name', 'website']),
        full.commentRemember(['name', 'website']),
      );
      equal(
        m.apiError('CommentUnsubscribeInvalid'),
        full.apiError('CommentUnsubscribeInvalid'),
      );
      equal(
        m.webError('BulkTooMany', { limit: 10 }),
        full.webError('BulkTooMany', { limit: 10 }),
      );
    }
  }
});
