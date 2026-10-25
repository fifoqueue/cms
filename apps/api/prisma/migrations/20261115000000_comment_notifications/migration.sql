-- Comments already approved count as announced, so later moderation flips stay silent.
ALTER TABLE `comments`
  ADD COLUMN `notified_at` DATETIME(3) NULL,
  ADD COLUMN `reply_mail` BOOLEAN NOT NULL DEFAULT true;

UPDATE `comments` SET `notified_at` = `updated_at` WHERE `status` = 'approved';

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `comment_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `endpoint` VARCHAR(2048) NOT NULL,
    `endpoint_hash` CHAR(64) NOT NULL,
    `p256dh` VARCHAR(200) NOT NULL,
    `auth` VARCHAR(100) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `invalid_reason` VARCHAR(16) NULL,
    `invalidated_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `push_subscriptions_comment_id_endpoint_hash_key`(`comment_id`, `endpoint_hash`),
    UNIQUE INDEX `push_subscriptions_user_id_endpoint_hash_key`(`user_id`, `endpoint_hash`),
    INDEX `push_subscriptions_endpoint_hash_idx`(`endpoint_hash`),
    INDEX `push_subscriptions_status_invalidated_at_idx`(`status`, `invalidated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notice_windows` (
    `key` CHAR(64) NOT NULL,
    `window_end` DATETIME(3) NOT NULL,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `deferred` INTEGER NOT NULL DEFAULT 0,

    INDEX `notice_windows_window_end_idx`(`window_end`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
