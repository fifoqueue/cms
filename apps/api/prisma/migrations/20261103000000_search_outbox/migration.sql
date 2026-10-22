-- CreateTable
CREATE TABLE `search_outbox` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `content_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

