-- MariaDB fallback search must not scan every content body for each public query.
CREATE FULLTEXT INDEX `contents_title_excerpt_search_text_idx`
  ON `contents`(`title`, `excerpt`, `search_text`);
