-- Custom field values per term; existing terms start without values.
-- AlterTable
ALTER TABLE `taxonomy_terms` ADD COLUMN `fields` LONGTEXT NOT NULL DEFAULT '{}';

-- Media that term image fields point at, counted with `content_media` as media usage.
-- CreateTable
CREATE TABLE `term_media` (
    `term_id` CHAR(36) NOT NULL,
    `media_id` CHAR(36) NOT NULL,

    INDEX `term_media_media_id_idx`(`media_id`),
    PRIMARY KEY (`term_id`, `media_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `term_media` ADD CONSTRAINT `term_media_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `taxonomy_terms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `term_media` ADD CONSTRAINT `term_media_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
