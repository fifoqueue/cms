-- Only pending, short-lived requests are invalidated. Existing links and sessions survive.
DELETE FROM `sso_transactions`;
ALTER TABLE `sso_transactions`
    ADD COLUMN `provider_id` VARCHAR(32) NOT NULL DEFAULT 'default',
    ADD COLUMN `claim_token_hash` CHAR(64) NULL;

-- Create the replacement FK-supporting index before dropping the single-user unique index.
CREATE UNIQUE INDEX `user_identities_user_id_issuer_key` ON `user_identities` (`user_id`, `issuer`);
DROP INDEX `user_identities_user_id_key` ON `user_identities`;

CREATE TABLE `recovery_codes` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `code_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `recovery_codes_code_hash_key` (`code_hash`),
    INDEX `recovery_codes_user_id_idx` (`user_id`),
    CONSTRAINT `recovery_codes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
