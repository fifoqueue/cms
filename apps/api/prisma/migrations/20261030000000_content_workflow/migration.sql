-- Review, scheduling and private statuses, trash, sticky entries, password protection,
-- generated summaries and revisions. Existing content keeps its status.
-- DropIndex
DROP INDEX `contents_status_type_published_at_idx` ON `contents`;

-- DropIndex
DROP INDEX `contents_status_published_at_idx` ON `contents`;

-- AlterTable
ALTER TABLE `contents` ADD COLUMN `password_hash` VARCHAR(255) NULL,
    ADD COLUMN `sticky` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `summary` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `trashed_at` DATETIME(3) NULL,
    MODIFY `status` ENUM('draft', 'pending', 'scheduled', 'published', 'private') NOT NULL;

-- CreateTable
CREATE TABLE `content_revisions` (
    `id` CHAR(36) NOT NULL,
    `content_id` CHAR(36) NOT NULL,
    `author_id` CHAR(36) NULL,
    `kind` VARCHAR(16) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `excerpt` TEXT NOT NULL,
    `document` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `content_revisions_content_id_kind_created_at_idx`(`content_id`, `kind`, `created_at`),
    INDEX `content_revisions_author_id_idx`(`author_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `contents_status_type_trashed_at_published_at_idx` ON `contents`(`status`, `type`, `trashed_at`, `published_at`);

-- CreateIndex
CREATE INDEX `contents_status_trashed_at_published_at_idx` ON `contents`(`status`, `trashed_at`, `published_at`);

-- CreateIndex
CREATE INDEX `contents_trashed_at_idx` ON `contents`(`trashed_at`);

-- AddForeignKey
ALTER TABLE `content_revisions` ADD CONSTRAINT `content_revisions_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_revisions` ADD CONSTRAINT `content_revisions_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Summaries for existing entries; saving an entry regenerates it from the body.
UPDATE `contents` SET `summary` = LEFT(`search_text`, 300);
