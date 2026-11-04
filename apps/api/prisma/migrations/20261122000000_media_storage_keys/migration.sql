CREATE TABLE IF NOT EXISTS `media_storage_keys` (
  `key` VARBINARY(255) NOT NULL,
  `upload_id` CHAR(36) NULL,
  `media_id` CHAR(36) NULL,
  PRIMARY KEY (`key`),
  INDEX `media_storage_keys_media_id_idx` (`media_id`),
  CONSTRAINT `media_storage_keys_media_id_fkey` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Data catch-up is bounded, restartable application work; old API writers may still be live.
