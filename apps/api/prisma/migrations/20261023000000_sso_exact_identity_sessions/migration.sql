-- Security fix for single sign-on (approved invalidation: every user signs in again).
-- Sessions issued before this migration carry no identity binding, so an unlink could not revoke
-- the single sign-on ones among them; none of them survive. Accounts, content, settings and
-- plugins are untouched.
DELETE FROM `sessions`;

-- Pending sign-in requests (at most 10 minutes old) have no client key; they are abandoned.
DELETE FROM `sso_transactions`;

-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `identity_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `sso_transactions` ADD COLUMN `client_key` CHAR(64) NOT NULL;

-- Existing links keep their user and get an immutable id. Converting to VARBINARY keeps their
-- UTF-8 bytes; binary comparison makes issuer/subject matching exact (no case folding, no
-- trailing-space padding).
ALTER TABLE `user_identities` ADD COLUMN `id` CHAR(36) NULL;
UPDATE `user_identities` SET `id` = UUID();
ALTER TABLE `user_identities` DROP PRIMARY KEY,
    MODIFY `id` CHAR(36) NOT NULL,
    MODIFY `issuer` VARBINARY(255) NOT NULL,
    MODIFY `subject` VARBINARY(255) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateIndex
CREATE INDEX `sessions_identity_id_idx` ON `sessions`(`identity_id`);

-- CreateIndex
CREATE INDEX `sso_transactions_client_key_idx` ON `sso_transactions`(`client_key`);

-- CreateIndex
CREATE UNIQUE INDEX `user_identities_issuer_subject_key` ON `user_identities`(`issuer`, `subject`);

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_identity_id_fkey` FOREIGN KEY (`identity_id`) REFERENCES `user_identities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
