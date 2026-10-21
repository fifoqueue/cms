-- CreateTable
CREATE TABLE `user_identities` (
    `issuer` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_identities_user_id_key`(`user_id`),
    PRIMARY KEY (`issuer`, `subject`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sso_transactions` (
    `handle_hash` CHAR(64) NOT NULL,
    `state` VARCHAR(255) NOT NULL,
    `nonce` VARCHAR(255) NOT NULL,
    `code_verifier` VARCHAR(255) NOT NULL,
    `user_id` CHAR(36) NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `sso_transactions_user_id_idx`(`user_id`),
    INDEX `sso_transactions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`handle_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_identities` ADD CONSTRAINT `user_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sso_transactions` ADD CONSTRAINT `sso_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
