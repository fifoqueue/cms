ALTER TABLE `contents`
  ADD COLUMN `created_ip` VARCHAR(45) NULL,
  ADD COLUMN `created_user_agent` VARCHAR(255) NULL,
  ADD COLUMN `modified_ip` VARCHAR(45) NULL,
  ADD COLUMN `modified_user_agent` VARCHAR(255) NULL;

ALTER TABLE `content_revisions`
  ADD COLUMN `ip` VARCHAR(45) NULL,
  ADD COLUMN `user_agent` VARCHAR(255) NULL;
