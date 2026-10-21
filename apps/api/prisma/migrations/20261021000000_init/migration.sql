-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `token_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contents` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('post', 'page') NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `excerpt` TEXT NOT NULL,
    `document` LONGTEXT NOT NULL,
    `html` LONGTEXT NOT NULL,
    `status` ENUM('draft', 'published') NOT NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `author_id` CHAR(36) NOT NULL,

    UNIQUE INDEX `contents_slug_key`(`slug`),
    INDEX `contents_status_type_published_at_idx`(`status`, `type`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plugins` (
    `id` VARCHAR(64) NOT NULL,
    `entry` VARCHAR(255) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `installed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plugin_data` (
    `plugin_id` VARCHAR(64) NOT NULL,
    `scope` ENUM('settings', 'kv') NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NOT NULL,

    PRIMARY KEY (`plugin_id`, `scope`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contents` ADD CONSTRAINT `contents_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_data` ADD CONSTRAINT `plugin_data_plugin_id_fkey` FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

