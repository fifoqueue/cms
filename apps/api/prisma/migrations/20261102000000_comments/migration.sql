
-- AlterTable
ALTER TABLE `contents` ADD COLUMN `allow_comments` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `comment_count` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `comments` (
    `id` CHAR(36) NOT NULL,
    `content_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `author_name` VARCHAR(100) NOT NULL,
    `author_email` VARCHAR(191) NOT NULL,
    `author_url` VARCHAR(255) NOT NULL DEFAULT '',
    `body` TEXT NOT NULL,
    `status` ENUM('pending', 'approved', 'spam', 'trash') NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `comments_content_id_status_parent_id_created_at_idx`(`content_id`, `status`, `parent_id`, `created_at`),
    INDEX `comments_status_created_at_idx`(`status`, `created_at`),
    INDEX `comments_author_email_status_idx`(`author_email`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

