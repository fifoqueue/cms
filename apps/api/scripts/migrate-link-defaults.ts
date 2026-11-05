// Removes the `target="_blank"` + `rel="noopener noreferrer nofollow"` pair earlier editor
// versions stored on every link (entries, revisions and autosaves, patterns) and re-renders the
// stored HTML of entries and patterns. Safe to rerun; `--dry-run` only counts.
//
//   cd apps/api && bun --env-file=../../.env scripts/migrate-link-defaults.ts --dry-run
//   cd apps/api && bun --env-file=../../.env scripts/migrate-link-defaults.ts
import { loadConfig } from '#api/config';
import { createDatabase } from '#api/infra/prisma/client';
import { readInstallationConfig } from '#api/infra/installation/config-store';
import { migrateLinkDefaults } from '#api/infra/prisma/link-defaults';

const config = loadConfig({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? readInstallationConfig()?.DATABASE_URL,
});

if (!config.DATABASE_URL)
  throw new Error('No database configured: finish the setup wizard first.');

const dryRun = process.argv.includes('--dry-run');
const db = createDatabase(config.DATABASE_URL);
const report = await migrateLinkDefaults(db, { dryRun, batch: 200 });

await db.$disconnect();
console.log(
  `${dryRun ? 'Would update' : 'Updated'} ${report.contents} entries, ${report.revisions} revisions, ${report.patterns} patterns.`,
);
for (const row of report.skipped) console.log(`Skipped ${row}`);
