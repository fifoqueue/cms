-- Roles and public author fields. Existing users (installation administrators) stay administrators.
ALTER TABLE `users` ADD COLUMN `bio` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `locale` VARCHAR(16) NOT NULL DEFAULT '',
    ADD COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'administrator',
    ADD COLUMN `slug` VARCHAR(191) NULL;

-- A unique placeholder from the random tail of the id; administrators can rename it.
UPDATE `users` SET `slug` = CONCAT('user-', LOWER(RIGHT(REPLACE(`id`, '-', ''), 12)));

ALTER TABLE `users` MODIFY `slug` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `users_slug_key` ON `users`(`slug`);

CREATE INDEX `users_role_idx` ON `users`(`role`);
