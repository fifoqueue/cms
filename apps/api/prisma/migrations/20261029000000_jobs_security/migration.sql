-- Scheduler leases, durable jobs, shared rate limits, password links and API tokens.
-- CreateTable
CREATE TABLE `scheduled_tasks` (
    `name` VARCHAR(191) NOT NULL,
    `next_run_at` DATETIME(3) NOT NULL,
    `locked_until` DATETIME(3) NULL,
    `locked_by` VARCHAR(64) NULL,
    `last_run_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` CHAR(36) NOT NULL,
    `kind` VARCHAR(64) NOT NULL,
    `payload` LONGTEXT NOT NULL,
    `run_at` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `locked_by` VARCHAR(64) NULL,
    `last_error` TEXT NULL,
    `failed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `jobs_failed_at_run_at_idx`(`failed_at`, `run_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limit_buckets` (
    `key_hash` CHAR(64) NOT NULL,
    `window_start` DATETIME(3) NOT NULL,
    `hits` INTEGER NOT NULL,
    `blocked_until` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `rate_limit_buckets_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`key_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_tokens` (
    `token_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `purpose` VARCHAR(16) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `password_tokens_user_id_idx`(`user_id`),
    INDEX `password_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,

    UNIQUE INDEX `api_tokens_token_hash_key`(`token_hash`),
    INDEX `api_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `password_tokens` ADD CONSTRAINT `password_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

