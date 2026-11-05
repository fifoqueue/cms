ALTER TABLE `content_paths`
  ADD COLUMN `folded_hash` BINARY(32) NOT NULL
    DEFAULT (unhex(sha2(lcase(convert(`path` using ascii)),256))) AFTER `path`,
  ADD INDEX `content_paths_folded_hash_idx` (`folded_hash`);

CREATE TABLE `content_tombstones` (
  `path_hash` BINARY(32) NOT NULL,
  `path` VARBINARY(4096) NOT NULL,
  `removed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`path_hash`)
);

CREATE INDEX `media_public_url_idx` ON `media` (`public_url`(191));
