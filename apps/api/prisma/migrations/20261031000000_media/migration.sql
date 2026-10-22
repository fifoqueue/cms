-- Media library, featured images and media usage per entry.
-- AlterTable
ALTER TABLE `contents` ADD COLUMN `featured_media_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `media` (
    `id` CHAR(36) NOT NULL,
    `uploader_id` CHAR(36) NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `alt` TEXT NOT NULL DEFAULT '',
    `caption` TEXT NOT NULL DEFAULT '',
    `storage_key` VARCHAR(255) NOT NULL,
    `variants` TEXT NOT NULL DEFAULT '{}',
    `created_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_storage_key_key`(`storage_key`),
    INDEX `media_created_at_idx`(`created_at`),
    INDEX `media_uploader_id_idx`(`uploader_id`),
    INDEX `media_mime_idx`(`mime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_media` (
    `content_id` CHAR(36) NOT NULL,
    `media_id` CHAR(36) NOT NULL,

    INDEX `content_media_media_id_idx`(`media_id`),
    PRIMARY KEY (`content_id`, `media_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contents` ADD CONSTRAINT `contents_featured_media_id_fkey` FOREIGN KEY (`featured_media_id`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_uploader_id_fkey` FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_media` ADD CONSTRAINT `content_media_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_media` ADD CONSTRAINT `content_media_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

