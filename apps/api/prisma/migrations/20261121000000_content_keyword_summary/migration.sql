-- Filled on save; `scripts/backfill-keyword-summary.ts` fills entries saved before this column.
ALTER TABLE `contents` ADD COLUMN `keyword_summary` TEXT NOT NULL DEFAULT '';
