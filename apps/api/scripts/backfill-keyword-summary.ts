// Fills `contents.keyword_summary` (the focus-keyword paragraph used as the meta description) for
// entries saved before the column existed, the way `ContentService` derives it on save.
// Safe to rerun: every entry is recomputed from its stored document and focus keyword.
//
//   cd apps/api && bun --env-file=../../.env scripts/backfill-keyword-summary.ts
import type { ContentDocument } from '@cms/sdk';
import { keywordParagraph } from '@cms/content/plain-text';
import { loadConfig } from '#api/config';
import { createDatabase } from '#api/infra/prisma/client';
import { readInstallationConfig } from '#api/infra/installation/config-store';

const config = loadConfig({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? readInstallationConfig()?.DATABASE_URL,
});
if (!config.DATABASE_URL)
  throw new Error('No database configured: finish the setup wizard first.');

const db = createDatabase(config.DATABASE_URL);
const BATCH = 200;
let cursor: string | undefined;
let updated = 0;
for (;;) {
  const rows = await db.content.findMany({
    select: {
      id: true,
      document: true,
      passwordHash: true,
      seoFocusKeyword: true,
      keywordSummary: true,
    },
    orderBy: { id: 'asc' },
    take: BATCH,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  if (!rows.length) break;
  for (const row of rows) {
    const value =
      row.passwordHash === null
        ? keywordParagraph(
            JSON.parse(row.document) as ContentDocument,
            row.seoFocusKeyword,
          )
        : '';
    if (value === row.keywordSummary) continue;
    await db.content.update({
      where: { id: row.id },
      data: { keywordSummary: value },
    });
    updated += 1;
  }
  cursor = rows.at(-1)!.id;
}
await db.$disconnect();
console.log(`keyword_summary updated for ${updated} entries.`);
