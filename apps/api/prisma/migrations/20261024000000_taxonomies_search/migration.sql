-- Categories, tags and content search. Additive: existing rows are kept and backfilled.

-- AlterTable
-- Added nullable, backfilled, then made NOT NULL, so existing content stays valid and searchable.
-- The backfill derives the plain text from the stored HTML (tags removed, the entities the
-- renderer emits decoded); saving the content again replaces it with text from the document.
ALTER TABLE `contents` ADD COLUMN `search_text` LONGTEXT NULL;

UPDATE `contents` SET `search_text` = TRIM(REGEXP_REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REGEXP_REPLACE(`html`, '<[^>]*>', ' '),
        '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'),
    '\\s+', ' '));

ALTER TABLE `contents` MODIFY `search_text` LONGTEXT NOT NULL;

-- CreateTable
CREATE TABLE `taxonomy_terms` (
    `id` CHAR(36) NOT NULL,
    `taxonomy` ENUM('category', 'tag') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `parent_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `taxonomy_terms_parent_id_idx`(`parent_id`),
    UNIQUE INDEX `taxonomy_terms_taxonomy_slug_key`(`taxonomy`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_terms` (
    `content_id` CHAR(36) NOT NULL,
    `term_id` CHAR(36) NOT NULL,

    INDEX `content_terms_term_id_idx`(`term_id`),
    PRIMARY KEY (`content_id`, `term_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `taxonomy_terms` ADD CONSTRAINT `taxonomy_terms_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `taxonomy_terms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_terms` ADD CONSTRAINT `content_terms_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_terms` ADD CONSTRAINT `content_terms_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `taxonomy_terms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
